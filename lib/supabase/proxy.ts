import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => { items.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  const publicRoutes = new Set(["/login", "/register", "/forgot-password", "/reset-password", "/auth/callback"])
  const isPublicRoute = publicRoutes.has(pathname)
  const isProtectedRoute = pathname === "/dashboard" || pathname.startsWith("/classes") || pathname.startsWith("/pupils") || pathname.startsWith("/academic-records") || pathname.startsWith("/academic-activities") || pathname.startsWith("/risk-assessment") || pathname.startsWith("/interventions") || pathname.startsWith("/settings") || pathname.startsWith("/profile") || pathname.startsWith("/parent-notifications") || pathname.startsWith("/reports")

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(url)
  }

  if (user && isPublicRoute && pathname !== "/auth/callback" && pathname !== "/reset-password") {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return response
}
