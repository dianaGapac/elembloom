import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 })
  const body = await request.json() as { studentId?: string; interventionId?: string; to?: string; subject?: string; message?: string; type?: string }
  if (!body.studentId || !body.to || !body.subject || !body.message) return NextResponse.json({ error: "Recipient, subject, and message are required." }, { status: 400 })
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: connection } = await service.from("google_mail_connections").select("email,refresh_token").eq("teacher_id", user.id).maybeSingle()
  if (!connection) return NextResponse.json({ error: "Connect Google Gmail before sending parent messages." }, { status: 409 })
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) return NextResponse.json({ error: "Gmail OAuth is not fully configured. Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET to the server environment." }, { status: 503 })
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.GMAIL_CLIENT_ID, client_secret: process.env.GMAIL_CLIENT_SECRET, refresh_token: connection.refresh_token, grant_type: "refresh_token" }) })
  const token = await tokenResponse.json() as { access_token?: string; error?: string }
  if (!tokenResponse.ok || !token.access_token) return NextResponse.json({ error: token.error ?? "Gmail authorization expired. Reconnect Google." }, { status: 502 })
  const raw = [`To: ${body.to}`, `From: ${connection.email ?? "me"}`, `Subject: ${body.subject}`, "Content-Type: text/plain; charset=utf-8", "", body.message].join("\r\n")
  const encoded = Buffer.from(raw).toString("base64url")
  const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw: encoded }) })
  const gmail = await gmailResponse.json() as { id?: string; error?: { message?: string } }
  const status = gmailResponse.ok ? "sent" : "failed"
  await service.from("parent_communications").insert({ teacher_id: user.id, student_id: body.studentId, intervention_id: body.interventionId ?? null, recipient_email: body.to, subject: body.subject, body: body.message, message_type: body.type ?? "initial", status, gmail_message_id: gmail.id ?? null, error_message: gmail.error?.message ?? null, sent_at: gmailResponse.ok ? new Date().toISOString() : null })
  if (!gmailResponse.ok) return NextResponse.json({ error: gmail.error?.message ?? "Gmail could not send the message." }, { status: 502 })
  return NextResponse.json({ ok: true, messageId: gmail.id })
}
