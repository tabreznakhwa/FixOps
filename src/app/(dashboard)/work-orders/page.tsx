import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { Plus, ClipboardList } from 'lucide-react'
import { getPriorityColor, getStatusColor, formatStatus, formatDate, formatCurrency } from '@/lib/utils'

export const metadata = { title: 'Work Orders' }

const KANBAN_COLUMNS = [
  { key: 'new', label: 'New', color: 'bg-purple-500' },
  { key: 'assigned', label: 'Assigned', color: 'bg-blue-500' },
  { key: 'work_started', label: 'In Progress', color: 'bg-teal-500' },
  { key: 'waiting_parts', label: 'Waiting Parts', color: 'bg-orange-500' },
  { key: 'completed', label: 'Completed', color: 'bg-green-500' },
  { key: 'verified', label: 'Verified', color: 'bg-emerald-500' },
]

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<{ view?: string; status?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()
  const view = params.view ?? 'list'

  const { data: workOrdersRaw } = await supabase
    .from('work_orders')
    .select('id, work_order_number, job_description, priority, status, payment_status, scheduled_date, final_amount, customers(full_name), users!work_orders_assigned_to_fkey(full_name)')
    .not('status', 'in', '(invoiced,paid,cancelled)')
    .order('created_at', { ascending: false })
    .limit(100)
  const workOrders = workOrdersRaw as unknown as Array<{
    id: string; work_order_number: string; job_description: string | null; priority: string; status: string;
    payment_status: string; scheduled_date: string | null; final_amount: number;
    customers: { full_name: string } | null; users: { full_name: string } | null
  }>

  const grouped: Record<string, typeof workOrders> = {}
  KANBAN_COLUMNS.forEach((col) => {
    grouped[col.key] = workOrders?.filter((w) => w.status === col.key) ?? []
  })

  return (
    <div className="animate-fade-in h-full flex flex-col">
      <Header
        title="Work Orders"
        subtitle="Track jobs from assignment to completion"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-lg p-1">
              <Link
                href="/work-orders?view=kanban"
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'kanban' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Kanban
              </Link>
              <Link
                href="/work-orders?view=list"
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'list' || !view ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              >
                List
              </Link>
            </div>
            <Link
              href="/work-orders/new"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> New Work Order
            </Link>
          </div>
        }
      />

      {view === 'kanban' ? (
        /* Kanban Board */
        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-4 h-full min-w-max">
            {KANBAN_COLUMNS.map((col) => {
              const items = grouped[col.key] ?? []
              return (
                <div key={col.key} className="w-72 flex-shrink-0">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
                    <span className="text-sm font-semibold text-slate-700">{col.label}</span>
                    <span className="ml-auto text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-3 min-h-32">
                    {items.map((wo) => {
                      const customer = wo.customers as { full_name: string } | null
                      const assignee = wo.users as { full_name: string } | null
                      return (
                        <Link
                          key={wo.id}
                          href={`/work-orders/${wo.id}`}
                          className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-md transition-all"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-mono text-slate-400">{wo.work_order_number}</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getPriorityColor(wo.priority)}`}>
                              {wo.priority}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-slate-800 line-clamp-2 mb-3">
                            {wo.job_description ?? 'No description'}
                          </p>
                          <div className="text-xs text-slate-500 space-y-1">
                            <p>👤 {customer?.full_name}</p>
                            {assignee && <p>🔧 {assignee.full_name}</p>}
                            {wo.scheduled_date && <p>📅 {formatDate(wo.scheduled_date)}</p>}
                          </div>
                          {wo.final_amount > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                              <span className="text-xs text-slate-500">Amount</span>
                              <span className="text-xs font-bold text-slate-900">{formatCurrency(wo.final_amount)}</span>
                            </div>
                          )}
                        </Link>
                      )
                    })}
                    {items.length === 0 && (
                      <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
                        <p className="text-xs text-slate-400">No jobs here</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* List View */
        <div className="p-6">
          {!workOrders?.length ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No active work orders</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Work Order</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Customer</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Technician</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Priority</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Amount</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {workOrders.map((wo) => {
                    const customer = wo.customers as { full_name: string } | null
                    const assignee = wo.users as { full_name: string } | null
                    return (
                      <tr key={wo.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-5 py-3.5">
                          <p className="text-xs font-mono text-slate-400">{wo.work_order_number}</p>
                          <p className="text-sm font-semibold text-slate-800 mt-0.5 line-clamp-1 group-hover:text-blue-700 transition-colors">
                            {wo.job_description ?? '—'}
                          </p>
                          {wo.scheduled_date && (
                            <p className="text-xs text-slate-400 mt-0.5">📅 {formatDate(wo.scheduled_date)}</p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 hidden md:table-cell text-sm text-slate-700">
                          {customer?.full_name}
                        </td>
                        <td className="px-4 py-3.5 hidden lg:table-cell text-sm text-slate-600">
                          {assignee?.full_name ?? <span className="text-slate-400 italic">Unassigned</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getPriorityColor(wo.priority)}`}>
                            {wo.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(wo.status)}`}>
                            {formatStatus(wo.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 hidden sm:table-cell">
                          <p className="text-sm font-bold text-slate-900">{formatCurrency(wo.final_amount)}</p>
                          <p className={`text-xs ${getStatusColor(wo.payment_status)}`}>{wo.payment_status}</p>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <Link
                            href={`/work-orders/${wo.id}`}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
