import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Sidebar } from '@/components/layout/Sidebar'
import { AssignmentNotifier } from '@/components/layout/AssignmentNotifier'
import { getRoleAccess } from '@/lib/orgPermissions'
import { TabShellOrContent } from '@/components/layout/TabShellOrContent'
import { getAuthedProfile } from '@/lib/auth/session'

// Injected on EVERY dashboard page (iframe or not).
// At runtime it self-exits when not inside an iframe, so the outer shell is unaffected.
// Running synchronously before hydration ensures Next.js App Router cannot strip
// ?__tab=1 via its own history.replaceState calls during initialisation.
const IFRAME_GUARD = `(function(){
  if(window.self===window.top)return;
  var a=function(u){
    if(!u||typeof u!=='string'||u.indexOf('__tab=')!==-1)return u;
    if(u[0]==='#'||u.slice(0,11)==='javascript:')return u;
    return u.indexOf('?')!==-1?u+'&__tab=1':u+'?__tab=1';
  };
  var op=history.pushState.bind(history),or=history.replaceState.bind(history);
  history.pushState=function(s,t,u){return op(s,t,a(u));};
  history.replaceState=function(s,t,u){return or(s,t,a(u));};
})();`

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getAuthedProfile()

  if (!user) redirect('/login')
  if (!profile || profile.status === 'pending') redirect('/pending')
  if (profile.status !== 'active') redirect('/login')

  const headersList = await headers()
  const isTabMode = headersList.get('x-tab-mode') === '1'

  if (isTabMode) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: IFRAME_GUARD }} />
        <div className="min-h-screen bg-slate-50 overflow-y-auto">
          {children}
        </div>
      </>
    )
  }

  const moduleAccess = await getRoleAccess(profile.organization_id, profile.role)

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <script dangerouslySetInnerHTML={{ __html: IFRAME_GUARD }} />
      <TabShellOrContent
        isTabMode={false}
        sidebar={<Sidebar user={profile} moduleAccess={moduleAccess} />}
        assigner={<AssignmentNotifier userId={user.id} />}
      >
        {children}
      </TabShellOrContent>
    </>
  )
}
