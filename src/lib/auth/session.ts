import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type AuthedProfile = {
  organization_id: string
  role: string
  status: string
  full_name: string
  email: string
  avatar_url: string | null
}

// Every dashboard layout/page/route used to call auth.getUser() + its own
// fresh `users` query independently — each one a real network round trip to
// Supabase (getUser() specifically revalidates against the auth server, it's
// not a free local decode). A single page load routinely paid for this
// 2-3 times over (middleware, the dashboard layout, then the page itself),
// which is a large share of why navigation feels slow.
//
// React's cache() memoizes this per request: the layout and the page it
// wraps (and anything else in the same render) now share one call instead of
// each paying for it. It does NOT dedupe with proxy.ts's own getUser() call —
// that runs in Edge middleware, a separate process from the RSC render, so
// it's a hard boundary and stays as the security gate it already is.
export const getAuthedProfile = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, profile: null }

  const { data: profileRaw } = await supabase
    .from('users')
    .select('organization_id, role, status, full_name, email, avatar_url')
    .eq('id', user.id)
    .single()

  return { user, profile: profileRaw as unknown as AuthedProfile | null }
})
