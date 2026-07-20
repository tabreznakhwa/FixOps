import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Sidebar } from '@/components/layout/Sidebar'
import { AssignmentNotifier } from '@/components/layout/AssignmentNotifier'
import { getRoleAccess } from '@/lib/orgPermissions'
import { TabShellOrContent } from '@/components/layout/TabShellOrContent'

// Runs synchronously before React hydration — patches history API so that
// Next.js App Router initialization cannot strip ?__tab=1 from the URL.
const TAB_GUARD_SCRIPT = `(function(){
  var a=function(u){
    if(!u||typeof u!=='string'||u.indexOf('__tab=')!==-1)return u;
    return u.indexOf('?')!==-1?u+'&__tab=1':u+'?__tab=1';
  };
  var op=history.pushState.bind(history),or=history.replaceState.bind(history);
  history.pushState=function(s,t,u){return op(s,t,a(u));};
  history.replaceState=function(s,t,u){return or(s,t,a(u));};
})();`

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

  if (isTabMode) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: TAB_GUARD_SCRIPT }} />
        <div className="min-h-screen bg-slate-50 overflow-y-auto">
          {children}
        </div>
      </>
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
