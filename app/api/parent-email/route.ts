import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"

type ParentEmailBody = {
  studentId?: string
  interventionId?: string
  to?: string
  subject?: string
  message?: string
  type?: string
  attachment?: { fileName?: string; mimeType?: string; base64?: string }
}

const encodeBase64Lines = (value: Buffer | string) => Buffer.from(value).toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? ""

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) return NextResponse.json({ error: "Unable to verify your sign-in. Please sign in again." }, { status: 401 })
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 })

  let body: ParentEmailBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "The message request is not valid JSON." }, { status: 400 })
  }
  if (!body.studentId || !body.to || !body.subject || !body.message) return NextResponse.json({ error: "Recipient, subject, and message are required." }, { status: 400 })
  if (body.subject.length > 200 || body.message.length > 10_000 || /[\r\n]/.test(body.subject)) return NextResponse.json({ error: "The message subject or body is invalid." }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to)) return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 })
  if (body.type === "report_card" && (!body.attachment || body.attachment.mimeType !== "application/pdf" || !body.attachment.base64)) {
    return NextResponse.json({ error: "A PDF report card attachment is required." }, { status: 400 })
  }
  if (body.attachment && (
    body.attachment.mimeType !== "application/pdf" ||
    !body.attachment.base64 ||
    body.attachment.base64.length > 8_000_000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(body.attachment.base64)
  )) {
    return NextResponse.json({ error: "The PDF attachment is invalid or too large to email." }, { status: 400 })
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) return NextResponse.json({ error: "Email service is not configured on the server." }, { status: 503 })
  const service = createClient(serviceUrl, serviceKey, { auth: { persistSession: false } })
  const { data: student, error: studentError } = await service.from("students").select("id,class_id,parent_guardian_email").eq("id", body.studentId).maybeSingle()
  if (studentError) return NextResponse.json({ error: "Unable to verify the pupil record." }, { status: 500 })
  if (!student) return NextResponse.json({ error: "Pupil record not found." }, { status: 404 })
  const { data: classRecord, error: classError } = await service.from("classes").select("id,teacher_id").eq("id", student.class_id).maybeSingle()
  if (classError) return NextResponse.json({ error: "Unable to verify class ownership." }, { status: 500 })
  if (!classRecord || classRecord.teacher_id !== user.id) return NextResponse.json({ error: "You do not have permission to send communication for this pupil." }, { status: 403 })
  if (!student.parent_guardian_email || student.parent_guardian_email.toLowerCase() !== body.to.toLowerCase()) {
    return NextResponse.json({ error: "The recipient must match the parent or guardian email saved on this pupil record." }, { status: 400 })
  }
  if (body.interventionId) {
    const { data: intervention, error: interventionError } = await service.from("intervention_plans").select("id,student_id,teacher_id").eq("id", body.interventionId).maybeSingle()
    if (interventionError) return NextResponse.json({ error: "Unable to verify the related intervention." }, { status: 500 })
    if (!intervention || intervention.student_id !== student.id || intervention.teacher_id !== user.id) {
      return NextResponse.json({ error: "The related intervention does not belong to this pupil." }, { status: 403 })
    }
  }

  let attachmentBytes: Buffer | null = null
  if (body.attachment) {
    attachmentBytes = Buffer.from(body.attachment.base64!, "base64")
    if (attachmentBytes.length > 5_500_000 || attachmentBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return NextResponse.json({ error: "The PDF attachment is invalid or exceeds the email size limit." }, { status: 400 })
    }
  }

  const { data: connection, error: connectionError } = await service.from("google_mail_connections").select("email,refresh_token").eq("teacher_id", user.id).maybeSingle()
  if (connectionError) return NextResponse.json({ error: "Unable to load the connected Gmail account." }, { status: 500 })
  if (!connection) return NextResponse.json({ error: "Connect Google Gmail before sending parent messages." }, { status: 409 })
  const clientId = "318513417945-dsibjjqvu0pu5efs10u9ioiha25usl37.apps.googleusercontent.com"
  const clientSecret = process.env.secret
  if (!clientSecret) return NextResponse.json({ error: "Google OAuth secret is not available on the server." }, { status: 503 })

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    }),
  })
  const token = await tokenResponse.json() as { access_token?: string; error?: string }
  if (!tokenResponse.ok || !token.access_token) return NextResponse.json({ error: token.error ?? "Gmail authorization expired. Reconnect Google." }, { status: 502 })

  const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;")
  const emailHtml = `<!doctype html><html><body style="margin:0;background:#f4f7f6;font-family:Arial,Helvetica,sans-serif;color:#24322d"><div style="max-width:640px;margin:0 auto;padding:32px 16px"><div style="background:#1f6f5b;padding:22px 28px;border-radius:14px 14px 0 0"><div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:.2px">ElemBloom</div><div style="margin-top:5px;color:#dff4eb;font-size:13px">Supporting every learner’s growth</div></div><div style="background:#ffffff;padding:30px 28px;border:1px solid #dce8e2;border-top:0;border-radius:0 0 14px 14px"><div style="white-space:pre-wrap;font-size:15px;line-height:1.7">${escapeHtml(body.message)}</div><div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5eee9;color:#62736b;font-size:12px;line-height:1.5">This message was sent through ElemBloom’s secure family communication system. Please contact your child’s teacher if you have questions about this update.</div></div><div style="padding:18px;text-align:center;color:#84938c;font-size:11px">ElemBloom · Learning progress, shared with care</div></div></body></html>`
  const headers = [
    `To: ${student.parent_guardian_email}`,
    `From: ${connection.email ?? "me"}`,
    `Subject: =?UTF-8?B?${Buffer.from(body.subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
  ]
  let mimeBody: string
  if (attachmentBytes && body.attachment) {
    const boundary = `elembloom-${randomUUID()}`
    const fileName = (body.attachment.fileName ?? "report-card.pdf").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "report-card.pdf"
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
    mimeBody = [
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      encodeBase64Lines(Buffer.from(emailHtml, "utf8")),
      `--${boundary}`,
      `Content-Type: application/pdf; name="${fileName}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${fileName}"`,
      "",
      encodeBase64Lines(attachmentBytes),
      `--${boundary}--`,
      "",
    ].join("\r\n")
  } else {
    headers.push("Content-Type: text/html; charset=utf-8")
    mimeBody = emailHtml
  }
  const raw = [...headers, "", mimeBody].join("\r\n")
  const encoded = Buffer.from(raw).toString("base64url")
  const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  })
  const gmail = await gmailResponse.json() as { id?: string; error?: { message?: string } }
  const status = gmailResponse.ok ? "sent" : "failed"
  const { error: logError } = await service.from("parent_communications").insert({
    teacher_id: user.id,
    student_id: body.studentId,
    intervention_id: body.interventionId ?? null,
    recipient_email: student.parent_guardian_email,
    subject: body.subject,
    body: body.message,
    message_type: body.type ?? "initial",
    status,
    gmail_message_id: gmail.id ?? null,
    error_message: gmail.error?.message ?? null,
    sent_at: gmailResponse.ok ? new Date().toISOString() : null,
  })
  if (logError) console.error("Unable to record parent communication", { teacherId: user.id, studentId: student.id, error: logError.message })
  if (!gmailResponse.ok) return NextResponse.json({ error: gmail.error?.message ?? "Gmail could not send the message." }, { status: 502 })
  return NextResponse.json({ ok: true, messageId: gmail.id, logged: !logError })
}
