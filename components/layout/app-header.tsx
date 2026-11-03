"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronDown, LogOut, Menu, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

export function AppHeader({ onMenu }: { onMenu: () => void }) {
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<{ name: string; initials: string; avatar: string | null; schoolYear: string; schoolName: string }>({ name: "Teacher", initials: "T", avatar: null, schoolYear: "2026–2027", schoolName: "ElemBloom" })
  useEffect(() => {
    const supabase = createClient()
    let mounted = true
    async function loadProfile() {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser || !mounted) return
      const { data } = await supabase.from("profiles").select("full_name,avatar_path,school_year,school_name").eq("id", authUser.id).maybeSingle()
      const name = data?.full_name || authUser.user_metadata?.full_name || "Teacher"
      let avatar = null
      if (data?.avatar_path) avatar = (await supabase.storage.from("teacher-avatars").createSignedUrl(data.avatar_path, 3600)).data?.signedUrl ?? null
      if (mounted) setUser({ name, initials: name.split(" ").map((part: string) => part[0]).slice(0, 2).join("").toUpperCase(), avatar, schoolYear: data?.school_year || "2026–2027", schoolName: data?.school_name || "ElemBloom" })
    }
    loadProfile()
    const { data: listener } = supabase.auth.onAuthStateChange(() => loadProfile())
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])
  async function signOut() { const supabase = createClient(); await supabase.auth.signOut(); window.location.assign("/login") }
  return <header className="flex min-h-16 items-center justify-between gap-2 bg-white px-3 sm:px-5 lg:min-h-20 lg:px-8"><Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open navigation"><Menu aria-hidden="true" /></Button><div className="flex min-w-0 items-center gap-2 sm:gap-3"><img src="/logo.png" alt="ElemBloom" className="h-9 w-14 shrink-0 object-contain" /><div className="flex min-w-0 flex-col text-xs sm:flex-row sm:items-center sm:gap-3 sm:text-sm"><span className="truncate font-semibold text-foreground">{user.schoolName}</span><span className="hidden text-muted-foreground sm:inline">·</span><span className="truncate text-muted-foreground">School year {user.schoolYear}</span></div></div><div className="ml-auto flex items-center gap-2"><div className="relative"><Button variant="ghost" onClick={() => setOpen(!open)} className="gap-2 rounded-full border-0 pl-2 shadow-none hover:border-0 sm:gap-3" aria-expanded={open} aria-haspopup="menu"><span className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-secondary text-sm font-semibold text-primary">{user.avatar ? <img src={user.avatar} alt="" className="size-full object-cover" /> : user.initials}</span><span className="hidden text-left sm:block"><span className="block text-sm font-semibold">{user.name}</span><span className="block text-xs text-muted-foreground">Teacher</span></span><ChevronDown aria-hidden="true" /></Button>{open && <div className="absolute right-0 z-10 mt-2 w-48 rounded-xl border border-border bg-white p-1 shadow-lg" role="menu"><Link href="/profile" onClick={() => setOpen(false)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground" role="menuitem"><UserRound aria-hidden="true" />My Profile</Link><button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground" role="menuitem"><LogOut aria-hidden="true" />Sign out</button></div>}</div></div></header>
}
