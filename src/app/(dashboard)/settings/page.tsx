import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Users, Shield, Bell, Activity, ChevronRight, Building2, BookOpen } from 'lucide-react'
import Link from 'next/link'
import { UserRoleEditor } from './UserRoleEditor'
import { PermissionsEditor } from './PermissionsEditor'
import { getOrgPermissionsMatrix } from '@/lib/orgPermissions'
import { type ModuleKey } from '@/lib/permissions'

export const metadata = { title: 'Settings' }

const EDITABLE_MODULES: ModuleKey[] = ['operations', 'finance', 'hr', 'inventory', 'reports']

export default async function SettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await (supabase as any)
    .from('users')
    .select('role, full_name, email, organization_id')
    .eq('id', user!.id)
    .single()
  const profile = profileRaw as { role: string; full_name: string; email: string; organization_id: string | null } | null
  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner'

  const [permResult, pendingRes, allUsersRes] = await Promise.all([
    isAdmin && profile?.organization_id
      ? getOrgPermissionsMatrix(profile.organization_id)
      : Promise.resolve({ matrix: {}, tableExists: true }),
    (supabase as any)
      .from('users')
      .select('id, full_name, email, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    (supabase as any)
      .from('users')
      .select('id, full_name, email, role, status, created_at')
      .neq('status', 'pending')
      .order('created_at', { ascending: false }),
  ])

  const { matrix: permissionsMatrix, tableExists } = permResult as { matrix: Record<string, any>; tableExists: boolean }
  const pendingUsers = (pendingRes.data ?? []) as Array<{ id: string; full_name: string; email: string; created_at: string }>
  const allUsers = (allUsersRes.data ?? []) as Array<{ id: string; full_name: string; email: string; role: string; status: string; created_at: string }>

  return (
    <div className="animate-fade-in">
      <Header title="Settings" subtitle="User management, roles, and system configuration" />

      <div className="p-6 space-y-6">
        {/* Quick links */}
        {isAdmin && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link href="/settings/company"
              className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Company Settings</p>
                  <p className="text-xs text-slate-500">Logo, contact details, bank account</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
            </Link>
            <Link href="/settings/audit-trail"
              className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Activity className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Audit Trail</p>
                  <p className="text-xs text-slate-500">Full history of all user actions</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
            </Link>
            <Link href="/user-guide"
              className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 hover:border-green-300 hover:bg-green-50 transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">User Guide</p>
                  <p className="text-xs text-slate-500">How to use the system — printable PDF</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-green-600 transition-colors" />
            </Link>
          </div>
        )}

        {/* Pending approvals */}
        {isAdmin && pendingUsers.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-5 h-5 text-amber-600" />
              <h3 className="font-semibold text-amber-900">{pendingUsers.length} User{pendingUsers.length > 1 ? 's' : ''} Pending Approval</h3>
            </div>
            <div className="space-y-3">
              {pendingUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{u.full_name}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <form action={`/api/users/${u.id}/approve`} method="POST">
                      <button type="submit" className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors">
                        Approve
                      </button>
                    </form>
                    <form action={`/api/users/${u.id}/reject`} method="POST">
                      <button type="submit" className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-200 transition-colors">
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Team Members with inline role + status editor */}
        {isAdmin && (
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
              <Users className="w-4 h-4 text-slate-600" />
              <h3 className="font-semibold text-slate-900">Team Members</h3>
              <span className="ml-auto text-sm text-slate-500">{allUsers.length} users</span>
            </div>
            <div className="divide-y divide-slate-50">
              {allUsers.map((u) => (
                <UserRoleEditor key={u.id} user={u} currentUserId={user!.id} />
              ))}
            </div>
          </div>
        )}

        {/* Role Permissions Editor */}
        {isAdmin && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900 text-sm">Module Access by Role</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Click any cell to cycle between <span className="font-medium text-green-700">Full</span> (create/edit/delete) → <span className="font-medium text-blue-700">View</span> (read-only) → <span className="font-medium text-slate-500">None</span> (no access).
                Owner and Admin are always Full and cannot be restricted.
              </p>
            </div>
            <PermissionsEditor matrix={permissionsMatrix} editableModules={EDITABLE_MODULES} tableExists={tableExists} />
          </div>
        )}

        {/* My Profile */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-slate-600" />
            <h3 className="font-semibold text-slate-900">My Account</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Name</p>
              <p className="font-semibold text-slate-900 mt-0.5">{profile?.full_name}</p>
            </div>
            <div>
              <p className="text-slate-500">Email</p>
              <p className="font-semibold text-slate-900 mt-0.5">{profile?.email}</p>
            </div>
            <div>
              <p className="text-slate-500">Role</p>
              <p className="font-semibold text-slate-900 mt-0.5 capitalize">{profile?.role?.replace('_', ' ')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
