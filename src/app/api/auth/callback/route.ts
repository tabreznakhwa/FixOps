import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)

    if (!sessionError && data.user) {
      const adminSupabase = createAdminClient()
      const adminDb = adminSupabase as any

      const { data: org } = await adminDb
        .from('organizations')
        .select('id')
        .limit(1)
        .single() as { data: { id: string } | null }

      // Insert new user profile if not exists — does NOT overwrite role/status for existing users
      await adminDb.from('users').upsert({
        id: data.user.id,
        organization_id: org?.id ?? null,
        email: data.user.email!,
        full_name: data.user.user_metadata?.full_name ?? data.user.email!.split('@')[0],
        avatar_url: data.user.user_metadata?.avatar_url ?? null,
        role: 'call_center',
        status: 'pending',
      }, { onConflict: 'id', ignoreDuplicates: true })

      await adminDb
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', data.user.id)

      const { data: profileRaw } = await adminSupabase
        .from('users')
        .select('status')
        .eq('id', data.user.id)
        .single()

      const profile = profileRaw as { status: string } | null

      if (!profile) {
        return NextResponse.redirect(`${origin}/login?error=no_profile`)
      }

      if (profile.status === 'pending') {
        return NextResponse.redirect(`${origin}/pending`)
      }

      if (profile.status === 'inactive' || profile.status === 'rejected') {
        return NextResponse.redirect(`${origin}/login?error=account_disabled`)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
