import { createAdminClient, createClient } from '@/lib/supabase/server'
import { getAuthedProfile } from '@/lib/auth/session'
import { Header } from '@/components/layout/Header'
import { notFound, redirect } from 'next/navigation'
import { BackButton } from '@/components/ui/BackButton'
import { EditWorkOrderForm } from './EditWorkOrderForm'
import { resolveBack } from '@/lib/backNav'

export const metadata = { title: 'Edit Work Order' }

export default async function EditWorkOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ return_to?: string }> }) {
  const { id } = await params
  const { return_to } = await searchParams
  const supabase = await createClient()
  // Only non-sensitive staff directory fields cross this server boundary.
  const admin = createAdminClient()

  const { profile } = await getAuthedProfile()
  if (!profile || profile.status !== 'active' || !profile.organization_id) redirect('/login')

  const [woRes, usersRes, staffRes] = await Promise.all([
    (supabase as any)
      .from('work_orders')
      .select('id, work_order_number, service_category, priority, job_description, notes, scheduled_date, scheduled_time, estimated_hours, estimated_amount, final_amount, assigned_to, assigned_staff_id, technician_name')
      .eq('id', id)
      .single(),
    supabase.from('users').select('id, full_name, role').in('role', ['technician', 'admin', 'manager']).eq('status', 'active'),
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

  const detail = resolveBack(return_to, `/work-orders/${id}`, 'Work Order')

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
