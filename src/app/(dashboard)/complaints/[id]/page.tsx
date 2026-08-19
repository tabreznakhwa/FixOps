import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ClipboardList, Plus, Edit, CalendarClock } from 'lucide-react'
import { getPriorityColor, getStatusColor, formatStatus, formatDateTime, formatDate } from '@/lib/utils'
import { ComplaintActions } from './ComplaintActions'
import { InternalNotes } from './InternalNotes'
import { BackButton } from '@/components/ui/BackButton'
import { resolveBack } from '@/lib/backNav'

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

export default async function ComplaintDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ return_to?: string }>
}) {
  const back = resolveBack((await searchParams).return_to, '/complaints', 'All Complaints')
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
    technician_name: string | null; assigned_staff_id: string | null; visit_order: number | null
    customers: { full_name: string; mobile_number: string; email: string | null; area: string | null; city: string | null } | null
    users: { id: string; full_name: string } | null
  }

  const { data: { user: authUser } } = await supabase.auth.getUser()

  const [usersRes, staffRes, workOrdersRes, internalNotesRes, currentUserRes] = await Promise.all([
    supabase.from('users').select('id, full_name, role').in('role', ['technician', 'admin', 'manager']).eq('status', 'active'),
    supabase.from('staff').select('id, full_name, designation').eq('employment_status', 'active'),
    supabase.from('work_orders').select('id, work_order_number, status').eq('complaint_id', id).order('created_at', { ascending: false }),
    supabase.from('complaint_internal_notes').select('id, note, author_name, created_at, created_by, updated_at').eq('complaint_id', id).order('created_at', { ascending: false }),
    authUser
      ? supabase.from('users').select('role').eq('id', authUser.id).single()
      : Promise.resolve({ data: null }),
  ])
  const systemUsers = (usersRes.data ?? []) as unknown as { id: string; full_name: string; role: string }[]
  const staffMembers = (staffRes.data ?? []) as unknown as { id: string; full_name: string; designation: string | null }[]
  const technicians = [
    ...systemUsers.map(u => ({ id: u.id, full_name: u.full_name, type: 'user' as const, role: u.role })),
    ...staffMembers.map(s => ({ id: s.id, full_name: s.full_name, type: 'staff' as const, role: s.designation ?? 'Technician' })),
  ]
  const linkedWorkOrders = (workOrdersRes.data ?? []) as unknown as { id: string; work_order_number: string; status: string }[]
  const internalNotes = (internalNotesRes.data ?? []) as {
    id: string; note: string; author_name: string; created_at: string
    created_by: string | null; updated_at: string | null
  }[]
  const currentUserRole = (currentUserRes.data as { role: string } | null)?.role ?? null
  const canEditAnyNote = currentUserRole !== null && ['owner', 'admin', 'manager'].includes(currentUserRole)

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
            <BackButton fallbackHref={back.href} label={back.label} />
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

          {/* Waiting for Approval Alert */}
          {complaint.status === 'waiting_approval' && (
            <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-5">
              <h2 className="font-bold text-orange-900 text-base mb-2">⏳ Waiting for Approval</h2>
              <p className="text-sm text-orange-800">This complaint is awaiting customer approval before proceeding. Contact the customer to confirm acceptance of the quotation or proposed solution.</p>
            </div>
          )}

          {/* Work Orders Section - moved here for visibility */}
          {linkedWorkOrders.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-slate-500" /> Linked Work Orders
                </h2>
              </div>
              <div className="p-5 space-y-2">
                {linkedWorkOrders.map(wo => (
                  <Link
                    key={wo.id}
                    href={`/work-orders/${wo.id}?complaint_id=${complaint.id}`}
                    className="flex items-center justify-between p-3 bg-slate-50 hover:bg-blue-50 rounded-lg transition group border border-slate-200"
                  >
                    <div>
                      <p className="text-sm font-mono font-semibold text-slate-700 group-hover:text-blue-700">{wo.work_order_number}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Work Order</p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(wo.status)}`}>
                      {formatStatus(wo.status)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Internal Notes - moved to main area for visibility */}
          {internalNotes.length > 0 && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="font-semibold text-slate-900">Internal Notes ({internalNotes.length})</h2>
              </div>
              <div className="p-5 space-y-3 max-h-64 overflow-y-auto">
                {internalNotes.map(note => (
                  <div key={note.id} className="bg-white p-3 rounded-lg border border-slate-100">
                    <div className="flex items-start justify-between mb-1">
                      <p className="text-xs font-semibold text-slate-600">{note.author_name}</p>
                      <p className="text-xs text-slate-400">{formatDateTime(note.created_at)}</p>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{note.note}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
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
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-slate-800">🔧 {complaint.technician_name ?? complaint.users?.full_name}</p>
                {complaint.visit_order != null && (
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex-shrink-0">
                    #{complaint.visit_order}
                  </span>
                )}
              </div>
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
                    href={`/work-orders/${wo.id}?complaint_id=${complaint.id}`}
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
            currentVisitOrder={complaint.visit_order}
            technicians={technicians}
            statusFlow={STATUS_FLOW}
          />

          {/* Internal Notes — staff only, handover log */}
          <InternalNotes
            complaintId={complaint.id}
            initialNotes={internalNotes}
            currentUserId={authUser?.id ?? null}
            canEditAnyNote={canEditAnyNote}
          />
        </div>
      </div>
    </div>
  )
}
