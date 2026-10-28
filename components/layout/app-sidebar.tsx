"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  BarChart3,
  Bell,
  BookOpenCheck,
  ClipboardCheck,
  FileText,
  HeartPulse,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"

const navigation = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Pupils", href: "/pupils", icon: Users },
  { label: "Academic Records", href: "/academic-records", icon: BookOpenCheck },
  { label: "Risk Assessment", href: "/risk-assessment", icon: ShieldAlert },
  { label: "Interventions", href: "/interventions", icon: HeartPulse },
  { label: "Parent Notifications", href: "/parent-notifications", icon: Bell },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
]

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname()
  return (
    <aside className={cn("hidden shrink-0 border-r border-border bg-white transition-[width] duration-200 lg:flex lg:flex-col", collapsed ? "w-[76px]" : "w-64")}>
      <div className="flex h-20 items-center border-b border-border px-5">
        <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden" aria-label="ElemBloom dashboard">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Sparkles aria-hidden="true" /></span>
          {!collapsed && <span className="whitespace-nowrap text-lg font-bold tracking-tight text-foreground">Elem<span className="text-primary">Bloom</span></span>}
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-6" aria-label="Main navigation">
        {navigation.map(({ label, href, icon: Icon }) => {
          const active = pathname === href
          return <Link key={href} href={href} title={collapsed ? label : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors", active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground", collapsed && "justify-center px-0")}><Icon aria-hidden="true" />{!collapsed && <span>{label}</span>}</Link>
        })}
      </nav>
      <div className="border-t border-border p-3">
        <Button variant="ghost" size="sm" onClick={onToggle} className="w-full justify-center text-muted-foreground" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <><PanelLeftClose aria-hidden="true" /><span>Collapse menu</span></>}
        </Button>
      </div>
    </aside>
  )
}

export { navigation }
