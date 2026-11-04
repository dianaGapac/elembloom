import { NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 })

  const senderUserId = process.env.GMAIL_AUTH_SENDER_USER_ID
  if (!senderUserId || user.id !== senderUserId) {
    return NextResponse.json({ isAdmin: false, connected: false })
  }
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) return NextResponse.json({ error: "Central Gmail status is not configured on the server." }, { status: 503 })
  const service = createServiceClient(serviceUrl, serviceKey, { auth: { persistSession: false } })
  const { data: connection, error } = await service
    .from("google_mail_connections")
    .select("email")
    .eq("teacher_id", senderUserId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: "Unable to load the central Gmail connection." }, { status: 500 })
  return NextResponse.json({ isAdmin: true, connected: Boolean(connection?.email), email: connection?.email ?? null })
}
