import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

const GOOGLE_CLIENT_ID = "318513417945-dsibjjqvu0pu5efs10u9ioiha25usl37.apps.googleusercontent.com"
const GOOGLE_REDIRECT_URI = "https://elembloom-project-foundation.vercel.app/api/auth/google/callback"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const stateCookie = request.headers.get("cookie")?.match(/(?:^|;\s*)google_oauth_state=([^;]+)/)?.[1]
  if (!code || !state || !stateCookie || state !== stateCookie) return NextResponse.redirect(new URL("/interventions?google=error&reason=invalid_state", request.url))
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL("/login?next=/interventions", request.url))
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: process.env.secret ?? "", redirect_uri: GOOGLE_REDIRECT_URI, grant_type: "authorization_code" }) })
  const token = await tokenResponse.json() as { refresh_token?: string; access_token?: string; error?: string }
  if (!tokenResponse.ok || !token.refresh_token) return NextResponse.redirect(new URL(`/interventions?google=error&reason=${encodeURIComponent(token.error ?? "missing_refresh_token")}`, request.url))
  const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const googleProfileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } })
  const googleProfile = await googleProfileResponse.json() as { email?: string }
  const { error } = await service.from("google_mail_connections").upsert({ teacher_id: user.id, email: googleProfile.email ?? null, refresh_token: token.refresh_token, updated_at: new Date().toISOString() }, { onConflict: "teacher_id" })
  const response = NextResponse.redirect(new URL(error ? "/interventions?google=error&reason=storage" : "/interventions?google=connected", request.url))
  response.cookies.delete("google_oauth_state")
  return response
}
