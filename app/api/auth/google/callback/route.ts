import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

const GOOGLE_CLIENT_ID = "318513417945-dsibjjqvu0pu5efs10u9ioiha25usl37.apps.googleusercontent.com"
const GOOGLE_REDIRECT_URI = "https://elembloom-project-foundation.vercel.app/api/auth/google/callback"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const cookies = request.headers.get("cookie") ?? ""
  const stateCookie = cookies.match(/(?:^|;\s*)google_oauth_state=([^;]+)/)?.[1]
  const purpose = cookies.match(/(?:^|;\s*)google_oauth_purpose=([^;]+)/)?.[1]
  const isSystemSender = purpose === "system"
  const redirectPath = isSystemSender ? "/settings" : "/interventions"
  const finish = (query: string) => {
    const response = NextResponse.redirect(new URL(`${redirectPath}?${query}`, request.url))
    response.cookies.delete("google_oauth_state")
    response.cookies.delete("google_oauth_purpose")
    return response
  }
  if (!code || !state || !stateCookie || state !== stateCookie) return finish("gmail=error&reason=invalid_state")
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return finish("gmail=error&reason=session_expired")
  if (isSystemSender && (!process.env.GMAIL_AUTH_SENDER_USER_ID || user.id !== process.env.GMAIL_AUTH_SENDER_USER_ID)) {
    return finish("gmail=unauthorized")
  }
  const clientSecret = process.env.secret
  if (!clientSecret) return finish("gmail=error&reason=missing_google_secret")
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: clientSecret, redirect_uri: GOOGLE_REDIRECT_URI, grant_type: "authorization_code" }) })
  const token = await tokenResponse.json() as { refresh_token?: string; access_token?: string; error?: string }
  if (!tokenResponse.ok || !token.refresh_token) return finish(`gmail=error&reason=${encodeURIComponent(token.error ?? "missing_refresh_token")}`)
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) return finish("gmail=error&reason=server_not_configured")
  const service = createServiceClient(serviceUrl, serviceKey, { auth: { persistSession: false } })
  const googleProfileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } })
  const googleProfile = await googleProfileResponse.json() as { email?: string }
  if (!googleProfileResponse.ok || !googleProfile.email) return finish("gmail=error&reason=google_profile_unavailable")
  const { error } = await service.from("google_mail_connections").upsert({ teacher_id: user.id, email: googleProfile.email, refresh_token: token.refresh_token, updated_at: new Date().toISOString() }, { onConflict: "teacher_id" })
  if (error) return finish("gmail=error&reason=connection_storage")
  return finish(isSystemSender ? "gmail=connected" : "google=connected")
}
