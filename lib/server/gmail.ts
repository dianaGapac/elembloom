import "server-only"
import { createClient } from "@supabase/supabase-js"

const GOOGLE_CLIENT_ID = "318513417945-dsibjjqvu0pu5efs10u9ioiha25usl37.apps.googleusercontent.com"

export type CentralGmailCredentials = { accessToken: string; senderEmail: string }

export async function getCentralGmailCredentials(): Promise<CentralGmailCredentials> {
  const senderUserId = process.env.GMAIL_AUTH_SENDER_USER_ID
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const clientSecret = process.env.secret
  if (!senderUserId || !supabaseUrl || !serviceKey || !clientSecret) {
    throw new Error("Central Gmail is not configured. Set GMAIL_AUTH_SENDER_USER_ID and the server credentials.")
  }

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: connection, error } = await service
    .from("google_mail_connections")
    .select("email,refresh_token")
    .eq("teacher_id", senderUserId)
    .maybeSingle()
  if (error) throw new Error(`Unable to load the central Gmail connection: ${error.message}`)
  if (!connection?.email || !connection.refresh_token) {
    throw new Error("The central Gmail account has not been connected. Connect it from Settings.")
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    }),
  })
  const token = await tokenResponse.json() as { access_token?: string; error?: string }
  if (!tokenResponse.ok || !token.access_token) {
    throw new Error(token.error ?? "Central Gmail authorization expired. Reconnect Gmail from Settings.")
  }
  return { accessToken: token.access_token, senderEmail: connection.email as string }
}

export async function sendWithCentralGmail(raw: string, credentials?: CentralGmailCredentials) {
  const { accessToken } = credentials ?? await getCentralGmailCredentials()
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  })
  const result = await response.json() as { id?: string; error?: { message?: string } }
  if (!response.ok) throw new Error(result.error?.message ?? "Gmail could not send the message.")
  return result
}
