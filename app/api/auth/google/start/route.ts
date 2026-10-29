import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const GOOGLE_CLIENT_ID = "318513417945-dsibjjqvu0pu5efs10u9ioiha25usl37.apps.googleusercontent.com"
const GOOGLE_REDIRECT_URI = "https://elembloom-project-foundation.vercel.app/api/auth/google/callback"

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL("/login?next=/interventions", request.url))
  const state = crypto.randomUUID()
  const params = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_REDIRECT_URI, response_type: "code", access_type: "offline", prompt: "consent", scope: "openid email https://www.googleapis.com/auth/gmail.send", state })
  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
  response.cookies.set("google_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" })
  return response
}
