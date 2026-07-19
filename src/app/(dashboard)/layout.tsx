import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
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

  const headersList = await headers()
  const isTabMode = headersList.get('x-tab-mode') === '1'

  // In tab mode (inside an iframe), skip sidebar/tab-bar and module access check
  if (isTabMode) {
    return (
      <TabShellOrContent isTabMode={true} sidebar={null} assigner={null}>
        {children}
      </TabShellOrContent>
    )
  }

  const moduleAccess = await getRoleAccess(profile.organization_id, profile.role)

  return (
    <TabShellOrContent
      isTabMode={false}
      sidebar={<Sidebar user={profile} moduleAccess={moduleAccess} />}
      assigner={<AssignmentNotifier userId={user.id} />}
    >
      {children}
    </TabShellOrContent>
  )
}
