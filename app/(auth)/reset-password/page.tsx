"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { LockKeyhole } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), [])
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null)
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void supabase.auth.getUser().then(({ data, error: sessionError }) => {
      setHasRecoverySession(!sessionError && Boolean(data.user))
    })
  }, [supabase])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    if (password !== confirmation) {
      setError("Passwords do not match.")
      return
    }
    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }
    window.location.assign("/dashboard")
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <header className="mb-6 text-center">
          <img src="/logo.png" alt="ElemBloom" className="mx-auto h-24 w-40 object-contain" />
          <h1 className="mt-4 text-xl font-bold">Set a new password</h1>
          <p className="mt-2 text-sm text-muted-foreground">Choose a new password for your ElemBloom account.</p>
        </header>
        {hasRecoverySession === null ? (
          <p className="text-center text-sm text-muted-foreground">Verifying your password-reset link…</p>
        ) : !hasRecoverySession ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-destructive">This password-reset link is invalid or has expired.</p>
            <Link href="/forgot-password" className="text-sm font-semibold text-primary hover:underline">Request another reset email</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-2 text-sm font-medium">
              New password
              <span className="flex h-11 items-center gap-3 rounded-lg border px-3 focus-within:ring-2 focus-within:ring-ring">
                <LockKeyhole className="size-4 text-muted-foreground" />
                <input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
              </span>
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Confirm new password
              <span className="flex h-11 items-center gap-3 rounded-lg border px-3 focus-within:ring-2 focus-within:ring-ring">
                <LockKeyhole className="size-4 text-muted-foreground" />
                <input required minLength={8} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
              </span>
            </label>
            {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <button disabled={saving} className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? "Updating password…" : "Update password"}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
