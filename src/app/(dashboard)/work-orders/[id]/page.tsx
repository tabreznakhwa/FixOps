import { createAdminClient } from '@/lib/supabase/server'
import { getAuthedProfile } from '@/lib/auth/session'
import { isWorkOrderAssignedToTechnician } from '@/lib/workOrderAccess'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Edit } from 'lucide-react'
import { BackButton } from '@/components/ui/BackButton'
import { getPriorityColor, getStatusColor, formatStatus, formatDate, formatCurrency } from '@/lib/utils'
import { currentPath, resolveBackWithLegacy, withReturnTo } from '@/lib/backNav'
import { WorkOrderActions } from './WorkOrderActions'
import { WorkOrderParts } from './WorkOrderParts'

export const metadata = { title: 'Work Order' }

export default async function WorkOrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ complaint_id?: string; return_to?: string }> }) {
  const { id } = await params
  const query = await searchParams
  const { complaint_id, return_to } = query
  const { user, profile } = await getAuthedProfile()
  if (!user || !profile || profile.status !== 'active' || !profile.organization_id) notFound()

  const admin = createAdminClient()
  const { data: raw } = await admin
    .from('work_orders')
    .select('*, customers(full_name, mobile_number, email, area, city), users!work_orders_assigned_to_fkey(id, full_name), complaints(complaint_number, description)')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (!raw) notFound()

  const wo = raw as unknown as {
    id: string; work_order_number: string; job_description: string | null
    priority: string; status: string; payment_status: string; service_category: string | null
    scheduled_date: string | null; estimated_hours: number | null; estimated_amount: number | null
    final_amount: number; notes: string | null; created_at: string
    organization_id: string; customer_id: string | null; technician_name: string | null
    assigned_to: string | null; assigned_staff_id: string | null
    customers: { full_name: string; mobile_number: string; email: string | null; area: string | null; city: string | null } | null
    users: { id: string; full_name: string } | null
    complaints: { complaint_number: string; description: string } | null
  }

  const orgId = wo.organization_id
  const isTechnician = profile.role === 'technician'
  let ownStaffId: string | null = null

  if (isTechnician && wo.assigned_to !== user.id) {
    const { data: ownStaffRaw } = await admin
      .from('staff')
      .select('id')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
      .eq('employment_status', 'active')
      .maybeSingle()
    ownStaffId = (ownStaffRaw as { id: string } | null)?.id ?? null
  }

  if (isTechnician && !isWorkOrderAssignedToTechnician({
    userId: user.id,
    staffId: ownStaffId,
    workOrder: wo,
  })) notFound()

  const [techniciansRaw, staffRaw, inventoryRaw, lineItemsRaw, woServicesRaw, invServicesRaw, invoiceRaw] = await Promise.all([
    isTechnician
      ? Promise.resolve({ data: [] })
      : admin.from('users').select('id, full_name, role').eq('organization_id', orgId).in('role', ['technician', 'admin', 'manager']).eq('status', 'active'),
    // Only non-sensitive staff directory fields cross this authorized server page.
    isTechnician
      ? Promise.resolve({ data: [] })
      : admin.from('staff').select('id, full_name, designation').eq('employment_status', 'active').eq('organization_id', orgId),
    admin.from('inventory_items').select(
      isTechnician
        ? 'id, item_code, item_name, unit_of_measure, current_stock'
        : 'id, item_code, item_name, unit_of_measure, current_stock, selling_price'
    ).eq('is_active', true).eq('organization_id', orgId).order('item_name'),
    // Technicians receive no billing prices in the RSC payload.
    admin.from('work_order_line_items')
      .select(
        isTechnician
          ? 'id, item_type, description, quantity, inventory_item_id'
          : 'id, item_type, description, quantity, unit_price, inventory_item_id'
      )
      .eq('work_order_id', id)
      .eq('organization_id', orgId)
      .order('created_at'),
    // All unique service/custom descriptions across all work orders
    admin.from('work_order_line_items')
      .select('description')
      .eq('organization_id', orgId)
      .in('item_type', ['service', 'custom'])
      .order('description'),
    // All unique descriptions from invoices
    admin.from('invoice_items')
      .select('description')
      .eq('organization_id', orgId)
      .order('description'),
    // Has this work order already been invoiced? Ignore cancelled invoices so admin can re-create.
    isTechnician
      ? Promise.resolve({ data: null })
      : admin.from('invoices').select('id, status').eq('organization_id', orgId).eq('work_order_id', id).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const systemUsers = (techniciansRaw.data ?? []) as unknown as { id: string; full_name: string; role: string }[]
  const staffMembers = (staffRaw.data ?? []) as unknown as { id: string; full_name: string; designation: string | null }[]
  const technicians = [
    ...systemUsers.map(u => ({ id: u.id, full_name: u.full_name, type: 'user' as const, role: u.role })),
    ...staffMembers.map(s => ({ id: s.id, full_name: s.full_name, type: 'staff' as const, role: s.designation ?? 'Technician' })),
  ]
  const inventoryItems = (inventoryRaw.data ?? []).map((item: {
    id: string
    item_code: string
    item_name: string
    unit_of_measure: string
    current_stock: number
    selling_price?: number
  }) => ({
    ...item,
    selling_price: isTechnician ? 0 : Number(item.selling_price) || 0,
  }))
  const existingParts = ((lineItemsRaw.data ?? []) as unknown as {
    id: string; item_type: 'custom' | 'part' | 'service'; description: string; quantity: number; unit_price?: number; inventory_item_id: string | null
  }[]).map(item => ({
    ...item,
    unit_price: isTechnician ? 0 : Number(item.unit_price) || 0,
  }))

  // Build unified list of previously-used service/custom labels (server-side dedup)
  const customServices = [
    ...new Set([
      ...(woServicesRaw.data ?? []).map((r: { description: string }) => r.description),
      ...(invServicesRaw.data ?? []).map((r: { description: string }) => r.description),
    ]),
  ].filter(Boolean).sort() as string[]

  const existingInvoice = invoiceRaw.data as { id: string; status: string } | null
  const existingInvoiceId = existingInvoice?.id ?? null
  const existingInvoiceStatus = existingInvoice?.status ?? null

  const workOrderPath = currentPath(`/work-orders/${id}`, query)
  const editHref = withReturnTo(`/work-orders/${id}/edit`, workOrderPath)
  const back = resolveBackWithLegacy({
    returnTo: return_to,
    legacy: [{ when: complaint_id, href: `/complaints/${complaint_id}`, label: 'Complaint' }],
    fallbackHref: '/work-orders',
    fallbackLabel: 'Work Orders',
  })

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
            {!isTechnician && (
              <Link
                href={editHref}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
              >
                <Edit className="w-4 h-4" /> Edit
              </Link>
            )}
            <BackButton href={back.href} label={back.label} />
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
            isCompleted={['completed', 'verified', 'invoiced', 'paid', 'cancelled'].includes(wo.status)}
            customServices={customServices}
            hidePrices={isTechnician}
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
              {!isTechnician && wo.estimated_amount && (
                <div>
                  <dt className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Estimated Amount</dt>
                  <dd className="text-slate-800 font-medium">{formatCurrency(wo.estimated_amount)}</dd>
                </div>
              )}
              {!isTechnician && (
                <div>
                  <dt className="text-slate-500 text-xs uppercase tracking-wider mb-0.5">Final Amount</dt>
                  <dd className="text-slate-800 font-bold text-base">{formatCurrency(wo.final_amount)}</dd>
                </div>
              )}
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
            finalAmount={isTechnician ? null : wo.final_amount}
            paymentStatus={wo.payment_status}
            existingInvoiceId={existingInvoiceId}
            existingInvoiceStatus={existingInvoiceStatus}
            workOrderHref={workOrderPath}
            isTechnician={isTechnician}
          />
        </div>
      </div>
    </div>
  )
}
