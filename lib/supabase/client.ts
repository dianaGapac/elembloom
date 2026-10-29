import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (typeof window !== "undefined" && (!url || !key)) throw new Error("Supabase public environment variables are missing.")
  return createBrowserClient(url ?? "https://placeholder.supabase.co", key ?? "build-placeholder-key")
}
