import { LoaderCircle } from "lucide-react"

export function GlobalLoading({ message = "Loading page…" }: { message?: string }) {
  return <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-live="polite"><div className="flex flex-col items-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-8 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" /><span>{message}</span></div></div>
}

export function PageLoading({ message = "Loading…" }: { message?: string }) {
  return <div suppressHydrationWarning className="flex min-h-48 items-center justify-center" role="status" aria-live="polite"><div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />{message}</div></div>
}

export function ButtonLoading({ children = "Saving…" }: { children?: React.ReactNode }) {
  return <span className="inline-flex items-center gap-2"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{children}</span>
}
