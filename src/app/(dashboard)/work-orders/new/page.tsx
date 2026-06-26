import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NewWorkOrderForm } from './NewWorkOrderForm'

export const metadata = { title: 'New Work Order' }

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ complaint_id?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const [customersRes, usersRes, staffRes, complaintsRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id, full_name, mobile_number, company_name')
      .eq('status', 'active')
      .order('full_name')
      .limit(5000),
    supabase
      .from('users')
      .select('id, full_name, role')
      .in('role', ['technician', 'admin', 'manager'])
      .eq('status', 'active')
      .order('full_name'),
    supabase
      .from('staff')
      .select('id, full_name, designation')
      .eq('employment_status', 'active')
      .order('full_name'),
    supabase
      .from('complaints')
      .select('id, complaint_number, description, priority, customer_id')
      .not('status', 'in', '(completed,verified,cancelled)')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const customers = (customersRes.data ?? []) as unknown as Array<{
    id: string; full_name: string; mobile_number: string | null; company_name: string | null
  }>

  // Combine system users + staff into one unified list
  const systemUsers = (usersRes.data ?? []) as unknown as Array<{ id: string; full_name: string; role: string }>
  const staffMembers = (staffRes.data ?? []) as unknown as Array<{ id: string; full_name: string; designation: string | null }>
  const technicians = [
    ...systemUsers.map(u => ({ id: u.id, full_name: u.full_name, type: 'user' as const, role: u.role })),
    ...staffMembers.map(s => ({ id: s.id, full_name: s.full_name, type: 'staff' as const, role: s.designation ?? 'Technician' })),
  ]

  const complaints = (complaintsRes.data ?? []) as unknown as Array<{
    id: string; complaint_number: string; description: string
    priority: string; customer_id: string
  }>

  // If complaint_id in URL, fetch that complaint directly to prefill the form
  let prefill: {
    complaint_id: string
    customer_id: string
    priority: string
    category: string
    job_description: string
    complaint_number: string
  } | null = null

  if (params.complaint_id) {
    const { data: linkedRaw } = await (supabase as any)
      .from('complaints')
      .select('id, complaint_number, description, priority, service_category, customer_id')
      .eq('id', params.complaint_id)
      .single()

    if (linkedRaw) {
      const linked = linkedRaw as {
        id: string; complaint_number: string; description: string
        priority: string; service_category: string | string[] | null; customer_id: string
      }
      const cats = Array.isArray(linked.service_category)
        ? linked.service_category
        : linked.service_category
          ? [linked.service_category]
          : []
      prefill = {
        complaint_id: linked.id,
        customer_id: linked.customer_id,
        priority: linked.priority,
        category: cats[0] ?? 'general',
        job_description: linked.description,
        complaint_number: linked.complaint_number,
      }
    }
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="New Work Order"
        subtitle={prefill ? `Linked to complaint ${prefill.complaint_number}` : 'Create a new service job'}
        actions={
          <Link
            href={prefill ? `/complaints/${prefill.complaint_id}` : '/work-orders'}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />
      <div className="p-6 max-w-2xl">
        {prefill && (
          <div className="mb-5 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <span className="text-blue-600 text-lg">📋</span>
            <div>
              <p className="text-sm font-semibold text-blue-900">
                Creating work order from complaint {prefill.complaint_number}
              </p>
              <p className="text-xs text-blue-600 mt-0.5">
                Customer, priority and description have been pre-filled. Just assign a technician and set a date.
              </p>
            </div>
          </div>
        )}
        <NewWorkOrderForm
          customers={customers}
          technicians={technicians}
          complaints={complaints}
          prefill={prefill}
        />
      </div>
    </div>
  )
}
