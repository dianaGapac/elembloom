"use client"

import Link from "next/link"
import { useState } from "react"
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sprout } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setLoading(true)
    const { error: signInError } = await createClient().auth.signInWithPassword({ email: email.trim(), password })
    if (signInError) setError(signInError.message.toLowerCase().includes("confirm") ? "Please confirm your email before signing in." : "Invalid email or password.")
    else window.location.assign(new URLSearchParams(window.location.search).get("next") || "/dashboard")
    setLoading(false)
  }

  return <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#e8fff3] px-4 py-8 text-[#17352a] sm:px-8">
    <div className="pointer-events-none absolute -top-40 left-1/2 size-[30rem] -translate-x-1/2 rounded-full bg-emerald-300/35 blur-3xl" />
    <header className="relative z-10 flex items-center justify-between"><div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-[#087a49] text-white"><Sprout className="size-4" /></span><div><p className="text-sm font-bold leading-none">ElemBloom</p><p className="mt-1 text-[10px] tracking-wider text-[#365448]">EDUCATOR PORTAL</p></div></div><p className="hidden text-xs text-[#365448] sm:block">Shielded by DepEd Data Privacy Protocol</p></header>
    <main className="relative z-10 flex flex-1 items-center justify-center py-10"><section className="w-full max-w-md rounded-2xl bg-white px-8 py-8 shadow-[0_18px_50px_rgba(24,91,57,.12)] sm:px-10"><div className="mb-7 text-center"><span className="mb-3 inline-flex items-center gap-1 rounded-full bg-[#dff6e9] px-3 py-1 text-[10px] font-semibold tracking-wide text-[#087a49]"><Sprout className="size-3" /> DEPED TEACHER PORTAL</span><div className="flex items-center justify-center gap-2"><span className="flex size-10 items-center justify-center rounded-xl bg-[#d9f2e4] text-[#087a49]"><Sprout className="size-6" /></span><span className="text-2xl font-bold">ElemBloom</span></div><p className="mt-1 text-sm text-[#52635a]">Helping Every Learner Bloom</p></div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5"><label className="flex flex-col gap-2 text-xs font-semibold">DepEd Email / Email Address<div className="flex items-center gap-3 rounded-lg border border-[#e1ebe5] px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#79c89d]"><Mail className="size-4 text-[#77867e]" /><input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="maria.santos@deped.gov.ph" className="min-w-0 flex-1 bg-transparent text-sm font-normal outline-none placeholder:text-[#a5b0aa]" /></div><span className="text-[11px] font-normal text-[#52635a]">Use your official DepEd Google Workspace or institutional ID</span></label><label className="flex flex-col gap-2 text-xs font-semibold">Password<div className="flex items-center gap-3 rounded-lg border border-[#e1ebe5] px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#79c89d]"><LockKeyhole className="size-4 text-[#77867e]" /><input required minLength={8} type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••••" className="min-w-0 flex-1 bg-transparent text-sm font-normal outline-none placeholder:text-[#a5b0aa]" /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="text-[#77867e]"><>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</></button></div></label><div className="flex items-center justify-between text-xs"><label className="flex items-center gap-2 text-[#52635a]"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="size-4 accent-[#087a49]" /> Remember this classroom device</label><Link href="/forgot-password" className="font-semibold text-[#087a49]">Forgot password?</Link></div>{error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}<button disabled={loading} className="rounded-lg bg-[#087a49] py-3 text-sm font-bold text-white transition hover:bg-[#05663c] disabled:opacity-60">{loading ? "Signing in…" : "Sign In →"}</button></form><p className="mt-7 text-center text-xs text-[#52635a]">Don&apos;t have an account? <Link href="/register" className="font-bold text-[#087a49]">Register your school profile</Link></p><p className="mt-9 flex items-center justify-center gap-1 text-[11px] text-[#52635a]"><ShieldCheck className="size-3 text-[#087a49]" /> Protected by DepEd Data Privacy Protocol (RA 10173)</p></section></main><footer className="relative z-10 flex flex-col justify-between gap-2 text-[11px] text-[#52635a] sm:flex-row"><span>◉ Compliant with Republic Act 10173 (Data Privacy Act of 2012) • Mabini Elementary School</span><span>DepEd Region IV-A　•　GovPH Security Shield</span></footer>
  </div>
}
