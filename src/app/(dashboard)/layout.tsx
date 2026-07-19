import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { AssignmentNotifier } from '@/components/layout/AssignmentNotifier'
import { getRoleAccess } from '@/lib/orgPermissions'
import { TabShellOrContent } from '@/components/layout/TabShellOrContent'

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
    <TabShellOrContent
      sidebar={<Sidebar user={profile} moduleAccess={moduleAccess} />}
      assigner={<AssignmentNotifier userId={user.id} />}
    >
      {children}
    </TabShellOrContent>
  )
}
