'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logAudit } from '@/lib/audit'

export async function createComplaint(
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
  const orgId = profile.organization_id

  const customerId = formData.get('customer_id') as string
  const serviceCategories = formData.getAll('service_category') as string[]
  const description = (formData.get('description') as string)?.trim()

  if (!customerId) return { error: 'Customer is required' }
  if (!serviceCategories.length) return { error: 'At least one service category is required' }
  if (!description || description.length < 5) return { error: 'Please provide a description (at least 5 characters)' }

  const { data: complaintNumber } = await (supabase as any).rpc('generate_sequence_number', {
    p_org_id: orgId,
    p_type: 'complaint',
    p_prefix: 'CMP',
  })

  const assignedTo = (formData.get('assigned_to') as string) || null

  const { error } = await (supabase as any).from('complaints').insert({
    organization_id: orgId,
    complaint_number: complaintNumber ?? `CMP-${Date.now()}`,
    customer_id: customerId,
    complaint_source: (formData.get('complaint_source') as string) || 'admin_entry',
    service_category: serviceCategories,
    priority: (formData.get('priority') as string) || 'medium',
    description,
    preferred_date: (formData.get('preferred_date') as string) || null,
    preferred_time: (formData.get('preferred_time') as string) || null,
    location: (formData.get('location') as string)?.trim() || null,
    assigned_to: assignedTo || null,
    status: assignedTo ? 'assigned' : 'new',
    created_by: user.id,
  })

  if (error) return { error: error.message }

  await logAudit({
    orgId,
    userId: user.id,
    userName: profile.full_name,
    action: 'create',
    entityType: 'complaint',
    entityLabel: `${serviceCategories.join(', ')} — ${description.slice(0, 60)}`,
  })

  revalidatePath('/complaints')
  redirect('/complaints')
}

export async function updateComplaint(
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
  if (!id) return { error: 'Complaint ID missing' }

  const serviceCategories = formData.getAll('service_category') as string[]
  const description = (formData.get('description') as string)?.trim()
  if (!serviceCategories.length) return { error: 'At least one service category is required' }
  if (!description || description.length < 5) return { error: 'Please provide a description (at least 5 characters)' }

  const { error } = await (supabase as any).from('complaints').update({
    service_category: serviceCategories,
    priority: (formData.get('priority') as string) || 'medium',
    description,
    preferred_date: (formData.get('preferred_date') as string) || null,
    preferred_time: (formData.get('preferred_time') as string) || null,
    location: (formData.get('location') as string)?.trim() || null,
    notes: (formData.get('notes') as string)?.trim() || null,
  }).eq('id', id).eq('organization_id', profile.organization_id)

  if (error) return { error: error.message }

  await logAudit({
    orgId: profile.organization_id,
    userId: user.id,
    userName: profile.full_name,
    action: 'update',
    entityType: 'complaint',
    entityLabel: description.slice(0, 60),
    entityId: id,
  })

  revalidatePath(`/complaints/${id}`)
  revalidatePath('/complaints')
  redirect(`/complaints/${id}`)
}
