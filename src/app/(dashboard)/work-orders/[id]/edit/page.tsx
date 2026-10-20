import { createAdminClient } from '@/lib/supabase/server'
import { getAuthedProfile } from '@/lib/auth/session'
import { Header } from '@/components/layout/Header'
import { notFound, redirect } from 'next/navigation'
import { BackButton } from '@/components/ui/BackButton'
import { EditWorkOrderForm } from './EditWorkOrderForm'
import { TechnicianEditWorkOrderForm } from './TechnicianEditWorkOrderForm'
import { resolveBack } from '@/lib/backNav'
import { isWorkOrderAssignedToTechnician } from '@/lib/workOrderAccess'
import { hasNonCancelledWorkOrderInvoice } from '@/lib/workOrderMutationAccess'

/* eslint-disable @typescript-eslint/no-explicit-any */

export const metadata = { title: 'Edit Work Order' }

export default async function EditWorkOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ return_to?: string }> }) {
  const { id } = await params
  const { return_to } = await searchParams
  const admin = createAdminClient()

  const { user, profile } = await getAuthedProfile()
  if (!user || !profile || profile.status !== 'active' || !profile.organization_id) redirect('/login')

  const detail = resolveBack(return_to, `/work-orders/${id}`, 'Work Order')

  if (profile.role === 'technician') {
    const { data: woRaw } = await (admin as any)
      .from('work_orders')
      .select('id, work_order_number, service_category, job_description, notes, status, assigned_to, assigned_staff_id')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single()

    const wo = woRaw as {
      id: string
      work_order_number: string
      service_category: string | null
      job_description: string | null
      notes: string | null
      status: string
      assigned_to: string | null
      assigned_staff_id: string | null
    } | null
    if (!wo) notFound()

    let ownStaffId: string | null = null
    if (wo.assigned_to !== user.id) {
      const { data: ownStaffRaw } = await admin
        .from('staff')
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', profile.organization_id)
        .eq('employment_status', 'active')
        .maybeSingle()
      ownStaffId = (ownStaffRaw as { id: string } | null)?.id ?? null
    }

    if (!isWorkOrderAssignedToTechnician({
      userId: user.id,
      staffId: ownStaffId,
      workOrder: wo,
    })) notFound()

    const invoiceGenerated = await hasNonCancelledWorkOrderInvoice(
      admin,
      profile.organization_id,
      id,
    )
    if (invoiceGenerated || ['invoiced', 'paid', 'cancelled'].includes(wo.status)) {
      redirect(detail.href)
    }

    const editableWorkOrder = {
      id: wo.id,
      service_category: wo.service_category,
      job_description: wo.job_description,
      notes: wo.notes,
    }

    return (
      <div className="animate-fade-in">
        <Header
          title={`Edit ${wo.work_order_number}`}
          subtitle="Update job details"
          actions={<BackButton href={detail.href} label="Cancel" />}
        />
        <div className="p-6 max-w-2xl">
          <TechnicianEditWorkOrderForm wo={editableWorkOrder} detailHref={detail.href} />
        </div>
      </div>
    )
  }

  // Only non-sensitive staff directory fields cross this server boundary.
  const [woRes, usersRes, staffRes] = await Promise.all([
    (admin as any)
      .from('work_orders')
      .select('id, work_order_number, service_category, priority, job_description, notes, scheduled_date, scheduled_time, estimated_hours, estimated_amount, final_amount, assigned_to, assigned_staff_id, technician_name')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single(),
    admin.from('users').select('id, full_name, role').eq('organization_id', profile.organization_id).in('role', ['technician', 'admin', 'manager']).eq('status', 'active'),
    admin.from('staff').select('id, full_name, designation').eq('employment_status', 'active').eq('organization_id', profile.organization_id),
  ])

  if (!woRes.data) notFound()

  const wo = woRes.data as {
    id: string; work_order_number: string; service_category: string | null;
    priority: string; job_description: string | null; notes: string | null;
    scheduled_date: string | null; scheduled_time: string | null;
    estimated_hours: number | null; estimated_amount: number | null; final_amount: number;
    assigned_to: string | null; assigned_staff_id: string | null; technician_name: string | null;
  }

  const systemUsers = (usersRes.data ?? []) as { id: string; full_name: string; role: string }[]
  const staffMembers = (staffRes.data ?? []) as { id: string; full_name: string; designation: string | null }[]
  const technicians = [
    ...systemUsers.map(u => ({ id: u.id, full_name: u.full_name, type: 'user' as const, role: u.role })),
    ...staffMembers.map(s => ({ id: s.id, full_name: s.full_name, type: 'staff' as const, role: s.designation ?? 'Technician' })),
  ]

  const currentAssigneeKey = wo.assigned_to
    ? `user:${wo.assigned_to}`
    : wo.assigned_staff_id
      ? `staff:${wo.assigned_staff_id}`
      : ''

  return (
    <div className="animate-fade-in">
      <Header
        title={`Edit ${wo.work_order_number}`}
        subtitle="Update work order details"
        actions={
          <BackButton href={detail.href} label="Cancel" />
        }
      />
      <div className="p-6 max-w-2xl">
        <EditWorkOrderForm wo={wo} technicians={technicians} currentAssigneeKey={currentAssigneeKey} detailHref={detail.href} returnTo={detail.href} />
      </div>
    </div>
  )
}
