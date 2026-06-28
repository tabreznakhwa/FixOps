import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Edit } from 'lucide-react'
import { getPriorityColor, getStatusColor, formatStatus, formatDate, formatCurrency } from '@/lib/utils'
import { WorkOrderActions } from './WorkOrderActions'
import { WorkOrderParts } from './WorkOrderParts'

export const metadata = { title: 'Work Order' }

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: raw } = await supabase
    .from('work_orders')
    .select('*, customers(full_name, mobile_number, email, area, city), users!work_orders_assigned_to_fkey(id, full_name), complaints(complaint_number, description)')
    .eq('id', id)
    .single()

  if (!raw) notFound()

  const wo = raw as unknown as {
    id: string; work_order_number: string; job_description: string | null
    priority: string; status: string; payment_status: string; service_category: string | null
    scheduled_date: string | null; estimated_hours: number | null; estimated_amount: number | null
    final_amount: number; notes: string | null; created_at: string
    customer_id: string | null; technician_name: string | null; assigned_staff_id: string | null
    customers: { full_name: string; mobile_number: string; email: string | null; area: string | null; city: string | null } | null
    users: { id: string; full_name: string } | null
    complaints: { complaint_number: string; description: string } | null
  }

  const [techniciansRaw, staffRaw, inventoryRaw] = await Promise.all([
    supabase.from('users').select('id, full_name, role').in('role', ['technician', 'admin', 'manager']).eq('status', 'active'),
    supabase.from('staff').select('id, full_name, designation').eq('employment_status', 'active'),
    (supabase as any).from('inventory_items').select('id, item_code, item_name, unit_of_measure, current_stock, selling_price').eq('is_active', true).order('item_name'),
  ])

  // Isolated so a missing table (pre-migration) never crashes the whole page
  const lineItemsRaw = await (supabase as any)
    .from('work_order_line_items')
    .select('id, item_type, description, quantity, unit_price, inventory_item_id')
    .eq('work_order_id', id)
    .order('created_at')

  const systemUsers = (techniciansRaw.data ?? []) as unknown as { id: string; full_name: string; role: string }[]
  const staffMembers = (staffRaw.data ?? []) as unknown as { id: string; full_name: string; designation: string | null }[]
  const technicians = [
    ...systemUsers.map(u => ({ id: u.id, full_name: u.full_name, type: 'user' as const, role: u.role })),
    ...staffMembers.map(s => ({ id: s.id, full_name: s.full_name, type: 'staff' as const, role: s.designation ?? 'Technician' })),
  ]
  const inventoryItems = (inventoryRaw.data ?? []) as unknown as {
    id: string; item_code: string; item_name: string; unit_of_measure: string; current_stock: number; selling_price: number
  }[]
  const existingParts = (lineItemsRaw.data ?? []) as unknown as {
    id: string; item_type: 'custom' | 'part' | 'service'; description: string; quantity: number; unit_price: number; inventory_item_id: string | null
  }[]

  return (
    <div className="animate-fade-in">
      <Header
        title={wo.work_order_number}
        subtitle={wo.job_description?.slice(0, 60) ?? 'Work Order Detail'}
        actions={
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${getStatusColor(wo.status)}`}>
              {formatStatus(wo.status)}
            </span>
            <Link
              href={`/work-orders/${wo.id}/edit`}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
            >
              <Edit className="w-4 h-4" /> Edit
            </Link>
            <Link href="/work-orders" className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
              <ArrowLeft className="w-4 h-4" /> All Work Orders
            </Link>
          </div>
        }
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl">
        {/* Left: main details */}
        <div className="lg:col-span-2 space-y-5">

          {/* Job description */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="font-semibold text-slate-900">Job Description</h2>
              <div className="flex gap-2 flex-shrink-0">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getPriorityColor(wo.priority)}`}>
                  {wo.priority}
                </span>
                {wo.service_category && (
                  <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full capitalize">
                    {wo.service_category.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            </div>
            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">
              {wo.job_description ?? '—'}
            </p>
            {wo.notes && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-slate-600">{wo.notes}</p>
              </div>
            )}
          </div>

          {/* Parts Used */}
          <WorkOrderParts
            workOrderId={wo.id}
            inventoryItems={inventoryItems}
            existingParts={existingParts}
            isCompleted={['invoiced', 'paid', 'cancelled'].includes(wo.status)}
          />

          {/* Financials + schedule */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Details</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {wo.scheduled_date && (
                <div>
                  <dt className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Scheduled Date</dt>
                  <dd className="text-slate-800 font-medium">{formatDate(wo.scheduled_date)}</dd>
                </div>
              )}
              {wo.estimated_hours && (
                <div>
                  <dt className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Estimated Hours</dt>
                  <dd className="text-slate-800 font-medium">{wo.estimated_hours}h</dd>
                </div>
              )}
              {wo.estimated_amount && (
                <div>
                  <dt className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Estimated Amount</dt>
                  <dd className="text-slate-800 font-medium">{formatCurrency(wo.estimated_amount)}</dd>
                </div>
              )}
              <div>
                <dt className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Final Amount</dt>
                <dd className="text-slate-800 font-bold text-base">{formatCurrency(wo.final_amount)}</dd>
              </div>
              <div>
                <dt className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Payment Status</dt>
                <dd>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(wo.payment_status)}`}>
                    {formatStatus(wo.payment_status)}
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          {wo.complaints && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 flex items-start gap-3">
              <span className="text-lg">📋</span>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Linked Complaint</p>
                <p className="text-sm font-semibold text-slate-800">{wo.complaints.complaint_number}</p>
                <p className="text-xs text-slate-500 line-clamp-1">{wo.complaints.description}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: customer + actions */}
        <div className="space-y-5">
          {/* Customer */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-3">Customer</h2>
            {wo.customers ? (
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-slate-900">{wo.customers.full_name}</p>
                <a href={`tel:${wo.customers.mobile_number}`} className="flex items-center gap-1.5 text-blue-600 hover:underline">
                  📱 {wo.customers.mobile_number}
                </a>
                {wo.customers.email && <p className="text-slate-600">✉️ {wo.customers.email}</p>}
                {wo.customers.area && (
                  <p className="text-slate-600">📍 {wo.customers.area}{wo.customers.city ? `, ${wo.customers.city}` : ''}</p>
                )}
              </div>
            ) : <p className="text-sm text-slate-400">No customer linked</p>}
          </div>

          {/* Technician */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-3">Assigned Technician</h2>
            {(wo.technician_name ?? wo.users?.full_name) ? (
              <p className="text-sm font-medium text-slate-800">🔧 {wo.technician_name ?? wo.users?.full_name}</p>
            ) : (
              <p className="text-sm text-slate-400 italic">Unassigned</p>
            )}
          </div>

          {/* Actions */}
          <WorkOrderActions
            workOrderId={wo.id}
            currentStatus={wo.status}
            currentAssigneeKey={
              wo.users?.id ? `user:${wo.users.id}` :
              wo.assigned_staff_id ? `staff:${wo.assigned_staff_id}` : null
            }
            technicians={technicians}
            customerId={wo.customer_id}
            finalAmount={wo.final_amount}
            paymentStatus={wo.payment_status}
          />
        </div>
      </div>
    </div>
  )
}
