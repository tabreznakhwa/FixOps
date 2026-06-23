import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { redirect } from 'next/navigation'
import { Activity, Search } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'Audit Trail' }

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  status_change: 'bg-purple-100 text-purple-700',
  approve: 'bg-teal-100 text-teal-700',
  reject: 'bg-red-100 text-red-700',
  login: 'bg-slate-100 text-slate-600',
  logout: 'bg-slate-100 text-slate-600',
  export: 'bg-amber-100 text-amber-700',
  print: 'bg-amber-100 text-amber-700',
  process_payroll: 'bg-indigo-100 text-indigo-700',
}

export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entity?: string; user?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRaw } = await (supabase as any)
    .from('users')
    .select('role, organization_id')
    .eq('id', user.id)
    .single()
  const profile = profileRaw as { role: string; organization_id: string } | null
  if (!profile || !['owner', 'admin'].includes(profile.role)) redirect('/dashboard?error=unauthorized')

  const from = sp.from ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const to = sp.to ?? new Date().toISOString().split('T')[0]

  let query = (supabase as any)
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, entity_label, user_name, changes, created_at')
    .eq('organization_id', profile.organization_id)
    .gte('created_at', from)
    .lte('created_at', to + 'T23:59:59')
    .order('created_at', { ascending: false })
    .limit(200)

  if (sp.action) query = query.eq('action', sp.action)
  if (sp.entity) query = query.eq('entity_type', sp.entity)
  if (sp.user) query = query.ilike('user_name', `%${sp.user}%`)

  const { data: logsRaw } = await query
  const logs = (logsRaw ?? []) as Array<{
    id: string
    action: string
    entity_type: string
    entity_id: string | null
    entity_label: string | null
    user_name: string | null
    changes: Record<string, { before: unknown; after: unknown }> | null
    created_at: string
  }>

  return (
    <div className="animate-fade-in">
      <Header
        title="Audit Trail"
        subtitle={`${logs.length} events — last 7 days by default`}
      />

      <div className="p-6 space-y-5">
        {/* Filters */}
        <form className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-32">
            <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
            <input type="date" name="from" defaultValue={from}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex-1 min-w-32">
            <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
            <input type="date" name="to" defaultValue={to}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex-1 min-w-32">
            <label className="block text-xs font-medium text-slate-500 mb-1">Action</label>
            <select name="action" defaultValue={sp.action ?? ''}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All actions</option>
              {['create', 'update', 'delete', 'status_change', 'approve', 'reject', 'process_payroll', 'export', 'print'].map((a) => (
                <option key={a} value={a}>{a.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-32">
            <label className="block text-xs font-medium text-slate-500 mb-1">Module</label>
            <select name="entity" defaultValue={sp.entity ?? ''}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All modules</option>
              {['customer', 'complaint', 'work_order', 'invoice', 'payment', 'staff', 'user', 'inventory', 'supplier'].map((e) => (
                <option key={e} value={e}>{e.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-36">
            <label className="block text-xs font-medium text-slate-500 mb-1">User</label>
            <input type="text" name="user" defaultValue={sp.user ?? ''} placeholder="Search by name…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400" />
          </div>
          <button type="submit"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            <Search className="w-4 h-4" /> Filter
          </button>
          <Link href="/settings/audit-trail"
            className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-200 transition-colors">
            Reset
          </Link>
        </form>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
            <Activity className="w-4 h-4 text-slate-500" />
            <span className="font-semibold text-slate-900 text-sm">Activity Log</span>
            <span className="ml-auto text-xs text-slate-400">{logs.length} records</span>
          </div>

          {logs.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">No audit events found for the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date & Time</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Module</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Record</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Changes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 text-slate-600 text-xs whitespace-nowrap font-mono">
                        {new Date(log.created_at).toLocaleDateString('en-GB')}
                        {' '}
                        <span className="text-slate-400">{new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">
                        {log.user_name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${ACTION_COLORS[log.action] ?? 'bg-slate-100 text-slate-600'}`}>
                          {log.action.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 capitalize text-xs">
                        {log.entity_type.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3 text-slate-700 text-xs max-w-48 truncate" title={log.entity_label ?? ''}>
                        {log.entity_label ?? log.entity_id ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {log.changes && Object.keys(log.changes).length > 0 ? (
                          <div className="space-y-0.5">
                            {Object.entries(log.changes).map(([field, { before, after }]) => (
                              <div key={field}>
                                <span className="text-slate-400">{field}:</span>{' '}
                                <span className="line-through text-red-400">{String(before)}</span>{' → '}
                                <span className="text-green-600 font-medium">{String(after)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
