import { createHmac, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { sendWithCentralGmail } from "@/lib/server/gmail"

export const runtime = "nodejs"

type AuthEmailPayload = {
  user?: { email?: string; new_email?: string; user_metadata?: { full_name?: string } }
  email_data?: {
    token?: string
    token_hash?: string
    token_new?: string
    token_hash_new?: string
    redirect_to?: string
    site_url?: string
    email_action_type?: string
  }
}

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;")

function verifyWebhook(payload: string, request: Request) {
  const configuredSecrets = process.env.SEND_EMAIL_HOOK_SECRETS
  const webhookId = request.headers.get("webhook-id")
  const webhookTimestamp = request.headers.get("webhook-timestamp")
  const webhookSignatures = request.headers.get("webhook-signature")
  if (!configuredSecrets || !webhookId || !webhookTimestamp || !webhookSignatures) return false

  const timestamp = Number(webhookTimestamp)
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false

  const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`
  const suppliedSignatures = webhookSignatures.split(/\s+/).flatMap((signature) => {
    const [version, value] = signature.split(",", 2)
    return version === "v1" && value ? [Buffer.from(value, "base64")] : []
  })
  const secrets = configuredSecrets.split("|").map((secret) => secret.trim().replace(/^v1,whsec_/, "")).filter(Boolean)

  return secrets.some((secret) => {
    const key = Buffer.from(secret, "base64")
    const expected = createHmac("sha256", key).update(signedContent).digest()
    return suppliedSignatures.some((signature) => signature.length === expected.length && timingSafeEqual(signature, expected))
  })
}

function makeVerificationUrl(tokenHash: string, action: string, redirectTo: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) throw new Error("Supabase URL is not configured.")
  const url = new URL("/auth/v1/verify", supabaseUrl)
  url.searchParams.set("token", tokenHash)
  url.searchParams.set("type", action)
  url.searchParams.set("redirect_to", redirectTo)
  return url.toString()
}

function makeEmail(recipient: string, subject: string, heading: string, description: string, actionUrl?: string, code?: string) {
  const safeHeading = escapeHtml(heading)
  const safeDescription = escapeHtml(description)
  const action = actionUrl
    ? `<p style="margin:26px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#087a49;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Continue to ElemBloom</a></p>`
    : ""
  const verificationCode = code
    ? `<p style="margin:22px 0 8px;color:#52635a">Or enter this verification code:</p><p style="font-size:24px;letter-spacing:5px;font-weight:bold">${escapeHtml(code)}</p>`
    : ""
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7f6;font-family:Arial,Helvetica,sans-serif;color:#24322d"><div style="max-width:600px;margin:0 auto;padding:32px 16px"><div style="background:#2e8b57;padding:18px 24px;border-radius:12px 12px 0 0;color:#fff;font-size:20px;font-weight:bold">ElemBloom</div><div style="background:#fff;padding:28px 24px;border:1px solid #dce8e2;border-top:0;border-radius:0 0 12px 12px"><h1 style="font-size:20px">${safeHeading}</h1><p style="font-size:15px;line-height:1.6">${safeDescription}</p>${action}${verificationCode}<p style="font-size:12px;color:#62736b">If you did not request this, you can ignore this message.</p></div></div></body></html>`
  const headers = [
    `To: ${recipient}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "",
  ]
  return Buffer.from(headers.join("\r\n")).toString("base64url")
}

const messages: Record<string, { subject: string; heading: string; description: string }> = {
  signup: { subject: "Confirm your ElemBloom email", heading: "Confirm your email address", description: "Please confirm your email address to finish creating your ElemBloom account." },
  invite: { subject: "Your ElemBloom invitation", heading: "You are invited to ElemBloom", description: "Use the secure link below to accept your invitation and continue to ElemBloom." },
  magiclink: { subject: "Your ElemBloom sign-in link", heading: "Sign in to ElemBloom", description: "Use the secure link below to sign in to your ElemBloom account." },
  recovery: { subject: "Reset your ElemBloom password", heading: "Reset your password", description: "We received a request to reset the password for your ElemBloom account." },
  email_change: { subject: "Confirm your ElemBloom email change", heading: "Confirm your email change", description: "Use the secure link below to confirm this email address change." },
  email: { subject: "Confirm your ElemBloom email", heading: "Confirm your email address", description: "Use the secure link below to confirm your email address." },
  reauthentication: { subject: "Verify your ElemBloom account", heading: "Verify your account", description: "Use the secure link or code below to verify this action." },
  password_changed_notification: { subject: "Your ElemBloom password was changed", heading: "Password changed", description: "The password for your ElemBloom account was changed. If you did not make this change, reset your password and contact support." },
  email_changed_notification: { subject: "Your ElemBloom email was changed", heading: "Email address changed", description: "The email address associated with your ElemBloom account was changed." },
  phone_changed_notification: { subject: "Your ElemBloom phone number was changed", heading: "Phone number changed", description: "The phone number associated with your ElemBloom account was changed." },
  identity_linked_notification: { subject: "A sign-in method was added to ElemBloom", heading: "Sign-in method added", description: "A new identity provider was linked to your ElemBloom account." },
  identity_unlinked_notification: { subject: "A sign-in method was removed from ElemBloom", heading: "Sign-in method removed", description: "An identity provider was unlinked from your ElemBloom account." },
  mfa_factor_enrolled_notification: { subject: "Multi-factor authentication enabled", heading: "Security method enabled", description: "A multi-factor authentication method was enrolled for your ElemBloom account." },
  mfa_factor_unenrolled_notification: { subject: "Multi-factor authentication changed", heading: "Security method removed", description: "A multi-factor authentication method was removed from your ElemBloom account." },
}
const notificationActions = new Set([
  "password_changed_notification",
  "email_changed_notification",
  "phone_changed_notification",
  "identity_linked_notification",
  "identity_unlinked_notification",
  "mfa_factor_enrolled_notification",
  "mfa_factor_unenrolled_notification",
])

export async function POST(request: Request) {
  const payloadText = await request.text()
  if (!verifyWebhook(payloadText, request)) {
    return NextResponse.json({ error: "The Auth email hook signature is invalid or expired." }, { status: 401 })
  }

  let payload: AuthEmailPayload
  try {
    payload = JSON.parse(payloadText) as AuthEmailPayload
  } catch {
    return NextResponse.json({ error: "The Auth email hook payload is not valid JSON." }, { status: 400 })
  }

  const emailData = payload.email_data
  const actionType = emailData?.email_action_type
  const template = actionType ? messages[actionType] : undefined
  if (!template || !payload.user || !emailData) {
    return NextResponse.json({ error: "The Auth email hook payload is missing a supported email action." }, { status: 400 })
  }

  const siteUrl = emailData.site_url
  const redirectTo = emailData.redirect_to || siteUrl
  if (!redirectTo || !/^https?:\/\//i.test(redirectTo)) {
    return NextResponse.json({ error: "The Auth email hook did not include a valid redirect URL." }, { status: 400 })
  }
  const recipientPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const deliveries: Array<{ recipient: string; tokenHash?: string; code?: string }> = []
  if (actionType === "email_change") {
    if (emailData.token_hash_new && emailData.token) {
      if (!payload.user.email || !recipientPattern.test(payload.user.email)) return NextResponse.json({ error: "The current account email is invalid." }, { status: 400 })
      deliveries.push({ recipient: payload.user.email, tokenHash: emailData.token_hash_new, code: emailData.token })
    }
    if (emailData.token_hash && emailData.token_new && payload.user.new_email) {
      if (!recipientPattern.test(payload.user.new_email)) return NextResponse.json({ error: "The new account email is invalid." }, { status: 400 })
      deliveries.push({ recipient: payload.user.new_email, tokenHash: emailData.token_hash, code: emailData.token_new })
    }
    if (!deliveries.length && emailData.token_hash && emailData.token) {
      const recipient = payload.user.new_email || payload.user.email
      if (recipient && recipientPattern.test(recipient)) deliveries.push({ recipient, tokenHash: emailData.token_hash, code: emailData.token })
    }
  } else {
    const recipient = payload.user.email
    if (recipient && recipientPattern.test(recipient)) {
      if (!notificationActions.has(actionType!) && !emailData.token_hash) {
        return NextResponse.json({ error: "The Auth email hook did not include a verification token." }, { status: 400 })
      }
      deliveries.push({
        recipient,
        tokenHash: emailData.token_hash,
        code: emailData.token,
      })
    }
  }
  if (!deliveries.length) return NextResponse.json({ error: "No valid recipient or verification token was provided." }, { status: 400 })

  try {
    for (const delivery of deliveries) {
      const url = delivery.tokenHash && !notificationActions.has(actionType!)
        ? makeVerificationUrl(delivery.tokenHash, actionType!, redirectTo)
        : undefined
      await sendWithCentralGmail(makeEmail(delivery.recipient, template.subject, template.heading, template.description, url, delivery.code))
    }
  } catch (sendError) {
    console.error("Auth email could not be sent through central Gmail", sendError)
    return NextResponse.json({ error: "The authentication email could not be sent through central Gmail." }, { status: 502 })
  }

  return NextResponse.json({})
}
