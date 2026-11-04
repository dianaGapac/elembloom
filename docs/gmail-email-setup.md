# Central Gmail email setup

ElemBloom sends parent communications and Supabase Auth emails through one Gmail account connected by the designated administrator. Individual teachers do not need to connect Gmail.

## Application environment

Set these server-side environment variables in the deployment:

- `GMAIL_AUTH_SENDER_USER_ID`: the designated ElemBloom administrator's user UUID from Supabase Auth.
- `SEND_EMAIL_HOOK_SECRETS`: the signing secret created for the Supabase Send Email HTTP Hook, in `v1,whsec_...` format. Multiple rotation secrets may be separated with `|`.
- Keep the existing `secret`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` variables configured. The Google OAuth client secret must remain server-side.

Redeploy after updating environment variables. Sign in to ElemBloom as the designated administrator and open Settings to connect or reconnect the central Gmail account. The Google account connected there becomes the sender for parent messages, risk updates, report cards, confirmation links, and password-reset links.

## Google OAuth

The Google OAuth client must have the Gmail API enabled and allow the deployed callback URI:

`https://elembloom-project-foundation.vercel.app/api/auth/google/callback`

The central sender must approve the `gmail.send` scope. Google may require the OAuth consent screen to be published or the sender account to be listed as a test user, depending on the app's verification status.

## Supabase Auth email hook

1. Deploy the application with the central sender connected and `SEND_EMAIL_HOOK_SECRETS` set.
2. In Supabase, open **Authentication → Hooks → Send Email** and create an **HTTP Hook**.
3. Use `https://elembloom-project-foundation.vercel.app/api/auth/send-email` as the endpoint URL.
4. Configure the hook's generated Standard Webhooks secret to match `SEND_EMAIL_HOOK_SECRETS`, then enable the hook.
5. In **Authentication → URL Configuration**, allow the application's `/auth/callback` and `/reset-password` redirect URLs.

The hook replaces Supabase's built-in Auth email delivery. It handles signup confirmations, recovery emails, sign-in links, email changes, and Auth notifications. The app rate-limits its Auth email requests by project/IP; Gmail's own sending quotas also apply.

## Operational notes

- The Auth hook requires a working central Gmail connection. If it is disconnected or revoked, Supabase cannot deliver confirmation or recovery emails until the admin reconnects it.
- The hook verifies Supabase's Standard Webhooks signature and timestamp before sending.
- Changing `GMAIL_AUTH_SENDER_USER_ID` changes which connected account is treated as the central sender.
