import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getRouteModule, getDefaultPermission, LOCKED_ROLES } from '@/lib/permissions'

const PUBLIC_PATHS = ['/login', '/auth/callback', '/pending', '/api/auth', '/portal', '/api/complaints/public']

export async function proxy(request: NextRequest) {
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
  const { pathname } = request.nextUrl

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
