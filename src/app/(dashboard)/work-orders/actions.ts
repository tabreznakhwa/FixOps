'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logAudit } from '@/lib/audit'

export async function updateWorkOrder(
  prevState: { error?: string } | null,
  formData: FormData
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profileRaw } = await supabase
    .from('users')
    .select('organization_id, full_name')
    .eq('id', user.id)
    .single()

  const profile = profileRaw as unknown as { organization_id: string; full_name: string } | null
  if (!profile?.organization_id) return { error: 'No organization found' }

  const id = formData.get('id') as string
  if (!id) return { error: 'Work Order ID missing' }

  const jobDescription = (formData.get('job_description') as string)?.trim()
  if (!jobDescription) return { error: 'Job description is required' }

  const assignedKey = (formData.get('assigned_key') as string) || ''
  const [pType, pId] = assignedKey ? assignedKey.split(':') : []
  const assignedTo = pType === 'user' ? (pId ?? null) : null
  const assignedStaffId = pType === 'staff' ? (pId ?? null) : null
  const technicianName = (formData.get('technician_name') as string)?.trim() || null

  const estimatedHoursRaw = formData.get('estimated_hours') as string
  const estimatedAmountRaw = formData.get('estimated_amount') as string
  const finalAmountRaw = formData.get('final_amount') as string

  const { error } = await (supabase as any).from('work_orders').update({
    service_category: (formData.get('service_category') as string) || null,
    priority: (formData.get('priority') as string) || 'medium',
    job_description: jobDescription,
    notes: (formData.get('notes') as string)?.trim() || null,
    scheduled_date: (formData.get('scheduled_date') as string) || null,
    scheduled_time: (formData.get('scheduled_time') as string) || null,
    estimated_hours: estimatedHoursRaw ? parseFloat(estimatedHoursRaw) : null,
    estimated_amount: estimatedAmountRaw ? parseFloat(estimatedAmountRaw) : null,
    final_amount: finalAmountRaw ? parseFloat(finalAmountRaw) : 0,
    assigned_to: assignedTo,
    assigned_staff_id: assignedStaffId,
    technician_name: technicianName,
  }).eq('id', id).eq('organization_id', profile.organization_id)

  if (error) return { error: error.message }

  await logAudit({
    orgId: profile.organization_id,
    userId: user.id,
    userName: profile.full_name,
    action: 'update',
    entityType: 'work_order',
    entityLabel: jobDescription.slice(0, 60),
    entityId: id,
  })

  revalidatePath(`/work-orders/${id}`)
  revalidatePath('/work-orders')
  redirect(`/work-orders/${id}`)
}
