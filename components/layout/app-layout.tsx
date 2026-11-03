"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { AppHeader } from "./app-header"
import { AppSidebar } from "./app-sidebar"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { isNavigationActive, navigation } from "./app-sidebar"
import Link from "next/link"
import { cn } from "@/lib/utils"

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  return <div suppressHydrationWarning className="flex min-h-screen bg-background"><AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} /><Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" className="w-72 p-0"><SheetTitle className="sr-only">ElemBloom navigation</SheetTitle><div className="flex h-full flex-col bg-white p-4"><div className="mb-6 flex items-center justify-center px-2"><img src="/logo.png" alt="ElemBloom" className="h-16 w-48 object-contain" /></div><nav className="flex flex-col gap-1" aria-label="Mobile navigation">{navigation.map(({ label, href, icon: Icon }) => { const active = isNavigationActive(pathname, href); return <Link key={href} href={href} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors", active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}><Icon aria-hidden="true" />{label}</Link> })}</nav></div></SheetContent></Sheet><div className="flex min-w-0 flex-1 flex-col"><AppHeader onMenu={() => setMobileOpen(true)} /><main className="min-w-0 flex-1 p-3 sm:p-5 lg:p-8">{children}</main></div></div>
}
