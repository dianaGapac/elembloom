"use client"

import { useState } from "react"
import { AppHeader } from "./app-header"
import { AppSidebar } from "./app-sidebar"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { navigation } from "./app-sidebar"
import Link from "next/link"
import { cn } from "@/lib/utils"

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  return <div suppressHydrationWarning className="flex min-h-screen bg-background"><AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} /><Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" className="w-72 p-0"><SheetTitle className="sr-only">ElemBloom navigation</SheetTitle><div className="flex h-full flex-col bg-white p-4"><div className="mb-6 flex items-center gap-3 px-2"><span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">✦</span><span className="text-lg font-bold">Elem<span className="text-primary">Bloom</span></span></div><nav className="flex flex-col gap-1">{navigation.map(({ label, href, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground", "") }><Icon aria-hidden="true" />{label}</Link>)}</nav></div></SheetContent></Sheet><div className="flex min-w-0 flex-1 flex-col"><AppHeader onMenu={() => setMobileOpen(true)} /><main className="flex-1 p-5 lg:p-8">{children}</main></div></div>
}
