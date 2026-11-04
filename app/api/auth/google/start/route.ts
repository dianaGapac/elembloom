import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const GOOGLE_CLIENT_ID = "318513417945-dsibjjqvu0pu5efs10u9ioiha25usl37.apps.googleusercontent.com"
const GOOGLE_REDIRECT_URI = "https://elembloom-project-foundation.vercel.app/api/auth/google/callback"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const isSystemSender = url.searchParams.get("system") === "1"
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.redirect(new URL(`/login?next=${isSystemSender ? "/settings" : "/interventions"}`, request.url))
  if (isSystemSender && (!process.env.GMAIL_AUTH_SENDER_USER_ID || user.id !== process.env.GMAIL_AUTH_SENDER_USER_ID)) {
    return NextResponse.redirect(new URL("/settings?gmail=unauthorized", request.url))
  }
  const state = crypto.randomUUID()
  const params = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_REDIRECT_URI, response_type: "code", access_type: "offline", prompt: "consent", scope: "openid email https://www.googleapis.com/auth/gmail.send", state })
  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
  response.cookies.set("google_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" })
  response.cookies.set("google_oauth_purpose", isSystemSender ? "system" : "teacher", { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" })
  return response
}
