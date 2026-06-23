import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getPriorityColor, getStatusColor, formatStatus, formatDate, formatCurrency } from '@/lib/utils'
import { WorkOrderActions } from './WorkOrderActions'

export const metadata = { title: 'Work Order' }

const WO_STATUS_FLOW = ['new', 'assigned', 'work_started', 'waiting_parts', 'completed', 'verified']

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
    technician_name: string | null; assigned_staff_id: string | null
    customers: { full_name: string; mobile_number: string; email: string | null; area: string | null; city: string | null } | null
    users: { id: string; full_name: string } | null
    complaints: { complaint_number: string; description: string } | null
  }

  const [techniciansRaw, staffRaw] = await Promise.all([
    supabase.from('users').select('id, full_name, role').in('role', ['technician', 'admin', 'manager']).eq('status', 'active'),
    supabase.from('staff').select('id, full_name, designation').eq('employment_status', 'active'),
  ])
  const systemUsers = (techniciansRaw.data ?? []) as unknown as { id: string; full_name: string; role: string }[]
  const staffMembers = (staffRaw.data ?? []) as unknown as { id: string; full_name: string; designation: string | null }[]
  const technicians = [
    ...systemUsers.map(u => ({ id: u.id, full_name: u.full_name, type: 'user' as const, role: u.role })),
    ...staffMembers.map(s => ({ id: s.id, full_name: s.full_name, type: 'staff' as const, role: s.designation ?? 'Technician' })),
  ]

  const currentStep = WO_STATUS_FLOW.indexOf(wo.status)

  return (
    <div className="animate-fade-in">
      <Header
        title={wo.work_order_number}
        subtitle={wo.job_description?.slice(0, 60) ?? 'Work Order Detail'}
        actions={
          <Link href="/work-orders" className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
            <ArrowLeft className="w-4 h-4" /> All Work Orders
          </Link>
        }
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl">
        {/* Left: main details */}
        <div className="lg:col-span-2 space-y-5">

          {/* Status pipeline */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Progress</h2>
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${getStatusColor(wo.status)}`}>
                {formatStatus(wo.status)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {WO_STATUS_FLOW.map((s, i) => (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-3 h-3 rounded-full ${i <= currentStep ? 'bg-blue-600' : 'bg-slate-200'}`} />
                    <span className="text-[10px] text-slate-500 mt-1 text-center leading-tight">{formatStatus(s)}</span>
                  </div>
                  {i < WO_STATUS_FLOW.length - 1 && (
                    <div className={`flex-1 h-0.5 mb-4 ${i < currentStep ? 'bg-blue-600' : 'bg-slate-200'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

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
            statusFlow={WO_STATUS_FLOW}
          />
        </div>
      </div>
    </div>
  )
}
