"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export function Sheet({ open, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) { return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>{children}</DialogPrimitive.Root> }
export function SheetContent({ side = "right", className, children }: { side?: "left" | "right"; className?: string; children: React.ReactNode }) { return <><DialogPrimitive.Portal><DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-black/30" /><DialogPrimitive.Popup className={cn("fixed inset-y-0 z-50 flex w-80 flex-col border-border bg-white shadow-xl", side === "left" ? "left-0 border-r" : "right-0 border-l", className)}><DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-accent"><X aria-hidden="true" /></DialogPrimitive.Close>{children}</DialogPrimitive.Popup></DialogPrimitive.Portal></> }
export function SheetTitle({ className, children }: { className?: string; children: React.ReactNode }) { return <DialogPrimitive.Title className={className}>{children}</DialogPrimitive.Title> }
