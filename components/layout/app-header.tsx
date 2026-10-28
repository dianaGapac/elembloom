"use client"

import { useState } from "react"
import { Bell, ChevronDown, LogOut, Menu, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"

export function AppHeader({ onMenu }: { onMenu: () => void }) {
  const [open, setOpen] = useState(false)
  return <header className="flex h-20 items-center justify-between border-b border-border bg-white px-5 lg:px-8">
    <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open navigation"><Menu aria-hidden="true" /></Button>
    <div className="hidden items-center gap-2 text-sm text-muted-foreground lg:flex"><span className="size-2 rounded-full bg-primary" aria-hidden="true" />School year 2025–2026</div>
    <div className="ml-auto flex items-center gap-2">
      <Button variant="ghost" size="icon" aria-label="Notifications"><Bell aria-hidden="true" /></Button>
      <div className="relative">
        <Button variant="ghost" onClick={() => setOpen(!open)} className="gap-3 rounded-full pl-2" aria-expanded={open} aria-haspopup="menu"><span className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-primary">MR</span><span className="hidden text-left sm:block"><span className="block text-sm font-semibold">Maria Reyes</span><span className="block text-xs text-muted-foreground">Grade 4 Adviser</span></span><ChevronDown aria-hidden="true" /></Button>
        {open && <div className="absolute right-0 z-10 mt-2 w-48 rounded-xl border border-border bg-white p-1 shadow-lg" role="menu"><button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground" role="menuitem"><UserRound aria-hidden="true" />Profile</button><button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground" role="menuitem"><LogOut aria-hidden="true" />Sign out</button></div>}
      </div>
    </div>
  </header>
}
