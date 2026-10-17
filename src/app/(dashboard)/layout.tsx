import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Sidebar } from '@/components/layout/Sidebar'
import { AssignmentNotifier } from '@/components/layout/AssignmentNotifier'
import { getRoleAccess } from '@/lib/orgPermissions'
import { getAuthedProfile } from '@/lib/auth/session'

// Injected on every dashboard page. Only active when this page was itself
// opened as a popup (?__popup=1, see DocumentLink) — keeps every later
// client-side navigation inside that same window (Back, Edit, nested document
// links) rendering bare, without the sidebar, by re-appending __popup=1 to
// history.pushState/replaceState before Next's router can strip it.
function popupGuard(isPopupMode: boolean) {
  return `(function(){
    if(!${isPopupMode}) return;
    var a=function(u){
      if(!u||typeof u!=='string'||u.indexOf('__popup=')!==-1)return u;
      if(u[0]==='#'||u.slice(0,11)==='javascript:')return u;
      return u.indexOf('?')!==-1?u+'&__popup=1':u+'?__popup=1';
    };
    var op=history.pushState.bind(history),or=history.replaceState.bind(history);
    history.pushState=function(s,t,u){return op(s,t,a(u));};
    history.replaceState=function(s,t,u){return or(s,t,a(u));};
  })();`
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getAuthedProfile()

  if (!user) redirect('/login')
  if (!profile || profile.status === 'pending') redirect('/pending')
  if (profile.status !== 'active') redirect('/login')

  const headersList = await headers()
  const isPopupMode = headersList.get('x-popup-mode') === '1'

  if (isPopupMode) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: popupGuard(true) }} />
        <div className="min-h-screen bg-slate-50 overflow-y-auto">
          {children}
        </div>
      </>
    )
  }

  const moduleAccess = await getRoleAccess(profile.organization_id, profile.role)

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar user={profile} moduleAccess={moduleAccess} />
      <div className="flex-1 flex flex-col min-w-0 lg:ml-14 overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <AssignmentNotifier userId={user.id} />
    </div>
  )
}
