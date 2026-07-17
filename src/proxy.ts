import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getRouteModule, getDefaultPermission, LOCKED_ROLES } from '@/lib/permissions'

const PUBLIC_PATHS = ['/login', '/auth/callback', '/pending', '/api/auth', '/portal', '/api/complaints/public']

// ---------------------------------------------------------------------------
// IP-based rate limiter (in-memory per edge-worker instance).
// For global enforcement across Vercel regions, swap for Upstash Redis / Vercel KV.
// ---------------------------------------------------------------------------
interface RLEntry { count: number; resetAt: number }
const rl = new Map<string, RLEntry>()
let pruneCounter = 0
function pruneExpired() {
  if (++pruneCounter % 500 !== 0) return
  const now = Date.now()
  for (const [k, v] of rl) { if (now > v.resetAt) rl.delete(k) }
}
function rlAllow(key: string, limit: number, windowMs: number): boolean {
  pruneExpired()
  const now = Date.now()
  const entry = rl.get(key)
  if (!entry || now > entry.resetAt) { rl.set(key, { count: 1, resetAt: now + windowMs }); return true }
  if (entry.count >= limit) return false
  entry.count++
  return true
}
function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'
}
function tooMany(retryAfterSecs: number) {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSecs) } },
  )
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const { method } = request
  const ip = getIp(request)

  // Rate limiting — applied before auth so bots never reach Supabase
  if (pathname === '/api/complaints/public' && method === 'POST') {
    if (!rlAllow(`cmp:${ip}`, 5, 60 * 60 * 1000)) return tooMany(3600)
  } else if (pathname.startsWith('/api/auth/') && method === 'POST') {
    if (!rlAllow(`auth:${ip}`, 15, 15 * 60 * 1000)) return tooMany(900)
  } else if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/callback')) {
    if (!rlAllow(`api:${ip}`, 300, 60 * 1000)) return tooMany(60)
  }


  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  if (!user && !isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && !isPublicPath) {
    const { data: profile } = await supabase
      .from('users')
      .select('status, role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/login?error=no_profile', request.url))
    }

    if (profile.status === 'pending' && pathname !== '/pending') {
      return NextResponse.redirect(new URL('/pending', request.url))
    }

    if (profile.status === 'inactive' || profile.status === 'rejected') {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/login?error=account_disabled', request.url))
    }

    // Technician: block supplier/vendor routes and stock-trial — stock list only
    if (profile.role === 'technician' && (
      pathname.startsWith('/suppliers') ||
      pathname.startsWith('/inventory/stock-trial')
    )) {
      return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url))
    }

    // Attendance kiosk: self-clock and own payslips only
    if (profile.role === 'attendance_kiosk' &&
      !pathname.startsWith('/my-attendance') &&
      !pathname.startsWith('/payroll/my-payslips') &&
      !pathname.startsWith('/payroll/slips') &&
      !pathname.startsWith('/api')) {
      return NextResponse.redirect(new URL('/my-attendance', request.url))
    }

    // Skip API routes (enforced at DB/RLS) and locked roles (always full access)
    if (!pathname.startsWith('/api') && !LOCKED_ROLES.includes(profile.role)) {
      const module = getRouteModule(pathname)
      if (module) {
        // Check DB for org-customised permission, fall back to system default
        const { data: permRow } = await supabase
          .from('role_permissions' as any)
          .select('permission')
          .eq('organization_id', profile.organization_id)
          .eq('role', profile.role)
          .eq('module', module)
          .maybeSingle()

        const permission = (permRow as any)?.permission ?? getDefaultPermission(profile.role, module)
        if (permission === 'none') {
          return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url))
        }
      }
    }
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
