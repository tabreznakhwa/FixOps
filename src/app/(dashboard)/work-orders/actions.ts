'use server'

import { createAdminClient, createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { returnToFromFormData } from '@/lib/backNav'

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function updateWorkOrder(
  prevState: { error?: string } | null,
  formData: FormData
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const { data: profileRaw } = await admin
    .from('users')
    .select('organization_id, full_name, role, status')
    .eq('id', user.id)
    .single()

  const profile = profileRaw as unknown as {
    organization_id: string | null
    full_name: string
    role: string
    status: string
  } | null
  if (!profile || profile.status !== 'active' || !profile.organization_id) {
    return { error: 'No active organization found' }
  }
  if (!['owner', 'admin', 'manager', 'call_center'].includes(profile.role)) {
    return { error: 'You are not allowed to edit work-order details' }
  }

  const id = formData.get('id') as string
  if (!id) return { error: 'Work Order ID missing' }

  const jobDescription = (formData.get('job_description') as string)?.trim()
  if (!jobDescription) return { error: 'Job description is required' }

  const assignedKey = (formData.get('assigned_key') as string) || ''
  const [pType, pId] = assignedKey ? assignedKey.split(':') : []
  const assignedTo = pType === 'user' ? (pId ?? null) : null
  const assignedStaffId = pType === 'staff' ? (pId ?? null) : null
  let technicianName: string | null = null

  const estimatedHoursRaw = formData.get('estimated_hours') as string
  const estimatedAmountRaw = formData.get('estimated_amount') as string
  const finalAmountRaw = formData.get('final_amount') as string
  const estimatedHours = estimatedHoursRaw ? Number(estimatedHoursRaw) : null
  const estimatedAmount = estimatedAmountRaw ? Number(estimatedAmountRaw) : null
  const finalAmount = finalAmountRaw ? Number(finalAmountRaw) : 0
  if (
    (estimatedHours !== null && (!Number.isFinite(estimatedHours) || estimatedHours < 0)) ||
    (estimatedAmount !== null && (!Number.isFinite(estimatedAmount) || estimatedAmount < 0)) ||
    !Number.isFinite(finalAmount) ||
    finalAmount < 0
  ) {
    return { error: 'Invalid amount or estimated hours' }
  }

  if (assignedTo) {
    const { data: assigneeRaw } = await admin
      .from('users')
      .select('id, full_name')
      .eq('id', assignedTo)
      .eq('organization_id', profile.organization_id)
      .eq('status', 'active')
      .single()
    const assignee = assigneeRaw as { id: string; full_name: string } | null
    if (!assignee) return { error: 'Assigned user not found' }
    technicianName = assignee.full_name
  }
  if (assignedStaffId) {
    const { data: assigneeRaw } = await admin
      .from('staff')
      .select('id, full_name')
      .eq('id', assignedStaffId)
      .eq('organization_id', profile.organization_id)
      .eq('employment_status', 'active')
      .single()
    const assignee = assigneeRaw as { id: string; full_name: string } | null
    if (!assignee) return { error: 'Assigned staff member not found' }
    technicianName = assignee.full_name
  }

  const { data: updatedRows, error } = await (admin as any).from('work_orders').update({
    service_category: (formData.get('service_category') as string) || null,
    priority: (formData.get('priority') as string) || 'medium',
    job_description: jobDescription,
    notes: (formData.get('notes') as string)?.trim() || null,
    scheduled_date: (formData.get('scheduled_date') as string) || null,
    scheduled_time: (formData.get('scheduled_time') as string) || null,
    estimated_hours: estimatedHours,
    estimated_amount: estimatedAmount,
    final_amount: finalAmount,
    assigned_to: assignedTo,
    assigned_staff_id: assignedStaffId,
    technician_name: technicianName,
  })
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .select('id')

  if (error) return { error: error.message }
  if (!updatedRows?.length) return { error: 'Work order not found' }

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
  return { success: true, workOrderId: id, returnTo: returnToFromFormData(formData) }
}
