import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  if (code) {
    const client = await createClient()
    const { data } = await client.auth.exchangeCodeForSession(code)
    const session = data.session
    if (session?.user && session.provider_refresh_token && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
      await service.from("google_mail_connections").upsert({ teacher_id: session.user.id, email: session.user.email ?? null, refresh_token: session.provider_refresh_token, updated_at: new Date().toISOString() }, { onConflict: "teacher_id" })
    }
  }
  return NextResponse.redirect(new URL("/interventions?google=connected", request.url))
}
