import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { Plus, ClipboardList } from 'lucide-react'
import { getPriorityColor, getStatusColor, formatStatus, formatDate, formatCurrency } from '@/lib/utils'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'

export const metadata = { title: 'Work Orders' }

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; from?: string; to?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()
  const hasDateFilter = Boolean(params.from || params.to)

  let query = supabase
    .from('work_orders')
    .select('id, work_order_number, job_description, priority, status, payment_status, scheduled_date, final_amount, customers(full_name), users!work_orders_assigned_to_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(hasDateFilter ? 1000 : 100)

  // Without a date filter, keep the list short by hiding already-closed-out work orders.
  // With a date filter, show everything in range (including invoiced/paid/cancelled) since
  // the user is looking back at a specific period rather than the active queue.
  if (!hasDateFilter) query = query.not('status', 'in', '(invoiced,paid,cancelled)')
  if (params.status) query = (query as any).eq('status', params.status)
  if (params.from) query = query.gte('created_at', `${params.from}T00:00:00`)
  if (params.to) query = query.lte('created_at', `${params.to}T23:59:59`)

  const { data: workOrdersRaw } = await query
  const workOrders = workOrdersRaw as unknown as Array<{
    id: string; work_order_number: string; job_description: string | null; priority: string; status: string;
    payment_status: string; scheduled_date: string | null; final_amount: number;
    customers: { full_name: string } | null; users: { full_name: string } | null
  }>

  return (
    <div className="animate-fade-in">
      <Header
        title="Work Orders"
        subtitle="Technician job records and billing"
        actions={
          <Link
            href="/work-orders/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Work Order
          </Link>
        }
      />

      <div className="p-6 space-y-5">
        <DateRangeFilter basePath="/work-orders" from={params.from} to={params.to} />

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
    </div>
  )
}
