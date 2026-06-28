import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ClipboardList, Plus, Edit, CalendarClock } from 'lucide-react'
import { getPriorityColor, getStatusColor, formatStatus, formatDateTime, formatDate } from '@/lib/utils'
import { ComplaintActions } from './ComplaintActions'

export const metadata = { title: 'Complaint Detail' }

const categoryIcons: Record<string, string> = {
  ac_maintenance: '❄️', plumbing: '🔧', electrical: '⚡',
  general: '🔨', emergency: '🚨', amc_visit: '📋',
  installation: '🏗️', inspection: '🔍', quotation: '📝',
}

const STATUS_FLOW = [
  'new', 'assigned', 'accepted', 'on_the_way',
  'work_started', 'waiting_parts', 'waiting_approval', 'completed',
]

export default async function ComplaintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: raw } = await supabase
    .from('complaints')
    .select('*, customers(full_name, mobile_number, email, area, city), users!complaints_assigned_to_fkey(id, full_name)')
    .eq('id', id)
    .single()

  if (!raw) notFound()

  const complaint = raw as unknown as {
    id: string; complaint_number: string; title: string | null; description: string
    priority: string; status: string; service_category: string | string[]
    created_at: string; preferred_date: string | null; preferred_time: string | null
    location: string | null; complaint_source: string | null; notes: string | null
    technician_name: string | null; assigned_staff_id: string | null
    customers: { full_name: string; mobile_number: string; email: string | null; area: string | null; city: string | null } | null
    users: { id: string; full_name: string } | null
  }

  const [usersRes, staffRes, workOrdersRes] = await Promise.all([
    supabase.from('users').select('id, full_name, role').in('role', ['technician', 'admin', 'manager']).eq('status', 'active'),
    supabase.from('staff').select('id, full_name, designation').eq('employment_status', 'active'),
    supabase.from('work_orders').select('id, work_order_number, status').eq('complaint_id', id).order('created_at', { ascending: false }),
  ])
  const systemUsers = (usersRes.data ?? []) as unknown as { id: string; full_name: string; role: string }[]
  const staffMembers = (staffRes.data ?? []) as unknown as { id: string; full_name: string; designation: string | null }[]
  const technicians = [
    ...systemUsers.map(u => ({ id: u.id, full_name: u.full_name, type: 'user' as const, role: u.role })),
    ...staffMembers.map(s => ({ id: s.id, full_name: s.full_name, type: 'staff' as const, role: s.designation ?? 'Technician' })),
  ]
  const linkedWorkOrders = (workOrdersRes.data ?? []) as unknown as { id: string; work_order_number: string; status: string }[]

  const categories = Array.isArray(complaint.service_category)
    ? complaint.service_category
    : [complaint.service_category]

  const currentStep = STATUS_FLOW.indexOf(complaint.status)

  return (
    <div className="animate-fade-in">
      <Header
        title={complaint.complaint_number}
        subtitle={complaint.title ?? complaint.description.slice(0, 60)}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/complaints/${complaint.id}/edit`}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
            >
              <Edit className="w-4 h-4" /> Edit
            </Link>
            <Link href="/complaints" className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
              <ArrowLeft className="w-4 h-4" /> All Complaints
            </Link>
          </div>
        }
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl">
        {/* Left column - main detail */}
        <div className="lg:col-span-2 space-y-5">

          {/* Status progress bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Status</h2>
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${getStatusColor(complaint.status)}`}>
                {formatStatus(complaint.status)}
              </span>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              {STATUS_FLOW.map((s, i) => (
                <div key={s} className="flex items-center gap-1 flex-shrink-0">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${i <= currentStep ? 'bg-blue-600' : 'bg-slate-200'}`} />
                  {i < STATUS_FLOW.length - 1 && (
                    <div className={`w-5 h-0.5 ${i < currentStep ? 'bg-blue-600' : 'bg-slate-200'}`} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-slate-400">New</span>
              <span className="text-xs text-slate-400">Verified</span>
            </div>
          </div>

          {/* Complaint description */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex gap-2 flex-wrap">
                {categories.map(cat => (
                  <span key={cat} className="flex items-center gap-1.5 bg-slate-100 text-slate-700 text-sm font-medium px-3 py-1.5 rounded-lg">
                    {categoryIcons[cat] ?? '🔧'} {cat.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
              <span className={`ml-auto flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${getPriorityColor(complaint.priority)}`}>
                {complaint.priority}
              </span>
            </div>
            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">{complaint.description}</p>
            {complaint.notes && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Internal Notes</p>
                <p className="text-sm text-slate-600">{complaint.notes}</p>
              </div>
            )}
          </div>

          {/* Details grid */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Details</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Source</dt>
                <dd className="text-slate-800 font-medium capitalize">{complaint.complaint_source?.replace(/_/g, ' ') ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Submitted</dt>
                <dd className="text-slate-800 font-medium">{formatDateTime(complaint.created_at)}</dd>
              </div>
              {complaint.preferred_date && (
                <div>
                  <dt className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Preferred Date</dt>
                  <dd className="text-slate-800 font-medium">{formatDate(complaint.preferred_date)}{complaint.preferred_time ? ` at ${complaint.preferred_time}` : ''}</dd>
                </div>
              )}
              {complaint.location && (
                <div className="col-span-2">
                  <dt className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Location</dt>
                  <dd className="text-slate-800 font-medium">{complaint.location}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Right column - customer + actions */}
        <div className="space-y-5">

          {/* Preferred Visit — prominent card for technician */}
          {(complaint.preferred_date || complaint.preferred_time) && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <CalendarClock className="w-5 h-5 text-amber-600" />
                <h2 className="font-bold text-amber-900 text-base">Preferred Visit</h2>
              </div>
              {complaint.preferred_date && (
                <p className="text-2xl font-bold text-amber-800 leading-tight">
                  {formatDate(complaint.preferred_date)}
                </p>
              )}
              {complaint.preferred_time && (
                <p className="text-lg font-semibold text-amber-700 mt-1">
                  🕐 {complaint.preferred_time}
                </p>
              )}
              {!complaint.preferred_date && complaint.preferred_time && (
                <p className="text-lg font-semibold text-amber-700">🕐 {complaint.preferred_time}</p>
              )}
            </div>
          )}

          {/* Customer */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-3">Customer</h2>
            {complaint.customers ? (
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-slate-900">{complaint.customers.full_name}</p>
                <a href={`tel:${complaint.customers.mobile_number}`} className="flex items-center gap-1.5 text-blue-600 hover:underline">
                  📱 {complaint.customers.mobile_number}
                </a>
                {complaint.customers.email && <p className="text-slate-600">✉️ {complaint.customers.email}</p>}
                {complaint.customers.area && <p className="text-slate-600">📍 {complaint.customers.area}{complaint.customers.city ? `, ${complaint.customers.city}` : ''}</p>}
              </div>
            ) : <p className="text-sm text-slate-400">No customer linked</p>}
          </div>

          {/* Technician */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-3">Assigned Technician</h2>
            {(complaint.technician_name ?? complaint.users?.full_name) ? (
              <p className="text-sm font-medium text-slate-800">🔧 {complaint.technician_name ?? complaint.users?.full_name}</p>
            ) : (
              <p className="text-sm text-slate-400 italic">Unassigned</p>
            )}
          </div>

          {/* Work Orders */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-slate-500" /> Work Orders
              </h2>
              <Link
                href={`/work-orders/new?complaint_id=${complaint.id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition"
              >
                <Plus className="w-3.5 h-3.5" /> Create WO
              </Link>
            </div>
            {linkedWorkOrders.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No work orders yet</p>
            ) : (
              <div className="space-y-2">
                {linkedWorkOrders.map(wo => (
                  <Link
                    key={wo.id}
                    href={`/work-orders/${wo.id}`}
                    className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-blue-50 rounded-lg transition group"
                  >
                    <span className="text-sm font-mono font-semibold text-slate-700 group-hover:text-blue-700">
                      {wo.work_order_number}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(wo.status)}`}>
                      {formatStatus(wo.status)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <ComplaintActions
            complaintId={complaint.id}
            currentStatus={complaint.status}
            currentAssigneeKey={
              complaint.users?.id ? `user:${complaint.users.id}` :
              complaint.assigned_staff_id ? `staff:${complaint.assigned_staff_id}` : null
            }
            technicians={technicians}
            statusFlow={STATUS_FLOW}
          />
        </div>
      </div>
    </div>
  )
}
