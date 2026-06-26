import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { EditWorkOrderForm } from './EditWorkOrderForm'

export const metadata = { title: 'Edit Work Order' }

export default async function EditWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [woRes, usersRes, staffRes] = await Promise.all([
    (supabase as any)
      .from('work_orders')
      .select('id, work_order_number, service_category, priority, job_description, notes, scheduled_date, scheduled_time, estimated_hours, estimated_amount, final_amount, assigned_to, assigned_staff_id, technician_name')
      .eq('id', id)
      .single(),
    supabase.from('users').select('id, full_name, role').in('role', ['technician', 'admin', 'manager']).eq('status', 'active'),
    supabase.from('staff').select('id, full_name, designation').eq('employment_status', 'active'),
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
          <Link
            href={`/work-orders/${id}`}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Cancel
          </Link>
        }
      />
      <div className="p-6 max-w-2xl">
        <EditWorkOrderForm wo={wo} technicians={technicians} currentAssigneeKey={currentAssigneeKey} />
      </div>
    </div>
  )
}
