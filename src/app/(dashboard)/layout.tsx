import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Sidebar } from '@/components/layout/Sidebar'
import { AssignmentNotifier } from '@/components/layout/AssignmentNotifier'
import { getRoleAccess } from '@/lib/orgPermissions'
import { TabInitializer } from '@/components/layout/TabInitializer'
import { TabBar } from '@/components/layout/TabBar'
import { TabShell } from '@/components/layout/TabShell'

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

  // When rendered inside an app tab iframe, strip the chrome
  const headersList = await headers()
  const isTabMode = headersList.get('x-tab-mode') === '1'

  if (isTabMode) {
    return (
      <div className="min-h-screen bg-slate-50 overflow-y-auto">
        {children}
      </div>
    )
  }

  const moduleAccess = await getRoleAccess(profile.organization_id, profile.role)

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <TabInitializer>
        <Sidebar user={profile} moduleAccess={moduleAccess} />
        <div className="flex-1 flex flex-col min-w-0 lg:ml-14 overflow-hidden">
          <TabBar />
          <TabShell />
        </div>
      </TabInitializer>
      <AssignmentNotifier userId={user.id} />
    </div>
  )
}
