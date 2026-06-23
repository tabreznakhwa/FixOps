import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { getRoleAccess } from '@/lib/orgPermissions'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profileRaw } = await supabase
    .from('users')
    .select('full_name, email, role, status, avatar_url, organization_id')
    .eq('id', user.id)
    .single()

  const profile = profileRaw as unknown as {
    full_name: string; email: string; role: string; status: string
    avatar_url: string | null; organization_id: string
  } | null

  if (!profile || profile.status === 'pending') redirect('/pending')
  if (profile.status !== 'active') redirect('/login')

  const moduleAccess = await getRoleAccess(profile.organization_id, profile.role)

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar user={profile} moduleAccess={moduleAccess} />
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64 overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
