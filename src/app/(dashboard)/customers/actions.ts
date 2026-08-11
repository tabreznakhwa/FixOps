'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logAudit } from '@/lib/audit'

/**
 * Deletes a customer. The reason is mandatory and is written to the audit log,
 * so a removed record always carries an explanation.
 *
 * Financial and operational history is never destroyed by this. Invoices,
 * payments, quotations and work orders block the delete outright — those are
 * the books and the job record. Complaints are the one thing that can go, and
 * only when the caller explicitly opts in, because a mistyped customer usually
 * has a stray complaint attached and nothing else.
 */
export async function deleteCustomer(
  id: string,
  reason: string,
  opts?: { deleteComplaints?: boolean }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profileRaw } = await supabase
    .from('users').select('organization_id, full_name, role').eq('id', user.id).single()
  const profile = profileRaw as unknown as { organization_id: string; full_name: string; role: string } | null
  if (!profile?.organization_id) return { error: 'No organization found' }
  if (!['owner', 'admin'].includes(profile.role)) {
    return { error: 'Only an owner or admin can delete a customer.' }
  }

  const trimmedReason = (reason ?? '').trim()
  if (trimmedReason.length < 5) {
    return { error: 'Please give a reason for deleting this customer (at least 5 characters).' }
  }

  // Anything financial or operational blocks the delete — these are records of
  // what actually happened and must not disappear to tidy up a list.
  const [
    { count: invoiceCount },
    { count: paymentCount },
    { count: workOrderCount },
    { count: quotationCount },
    { count: complaintCount },
  ] = await Promise.all([
    (supabase as any).from('invoices').select('id', { count: 'exact', head: true }).eq('customer_id', id),
    (supabase as any).from('payments').select('id', { count: 'exact', head: true }).eq('customer_id', id),
    (supabase as any).from('work_orders').select('id', { count: 'exact', head: true }).eq('customer_id', id),
    (supabase as any).from('quotations').select('id', { count: 'exact', head: true }).eq('customer_id', id),
    (supabase as any).from('complaints').select('id', { count: 'exact', head: true }).eq('customer_id', id),
  ])

  const blockers: string[] = []
  if ((invoiceCount ?? 0) > 0) blockers.push(`${invoiceCount} invoice(s)`)
  if ((paymentCount ?? 0) > 0) blockers.push(`${paymentCount} payment(s)`)
  if ((workOrderCount ?? 0) > 0) blockers.push(`${workOrderCount} work order(s)`)
  if ((quotationCount ?? 0) > 0) blockers.push(`${quotationCount} quotation(s)`)
  if (blockers.length > 0) {
    return {
      error: `Cannot delete — customer has ${blockers.join(', ')} on record. Mark them inactive instead.`,
    }
  }

  if ((complaintCount ?? 0) > 0 && !opts?.deleteComplaints) {
    return {
      error: `Customer has ${complaintCount} complaint(s). Tick the box below to delete those as well.`,
    }
  }

  const { data: customerRaw } = await (supabase as any)
    .from('customers').select('full_name, mobile_number').eq('id', id).eq('organization_id', profile.organization_id).single()

  // Complaints go first — the customer row cannot be removed while they point at it.
  if ((complaintCount ?? 0) > 0) {
    const { error: complaintErr } = await (supabase as any)
      .from('complaints').delete().eq('customer_id', id).eq('organization_id', profile.organization_id)
    if (complaintErr) return { error: `Could not delete linked complaints: ${complaintErr.message}` }
  }

  const { error } = await (supabase as any)
    .from('customers').delete().eq('id', id).eq('organization_id', profile.organization_id)
  if (error) return { error: error.message }

  await logAudit({
    orgId: profile.organization_id,
    userId: user.id,
    userName: profile.full_name,
    action: 'delete',
    entityType: 'customer',
    entityLabel: customerRaw ? `${customerRaw.full_name} (${customerRaw.mobile_number})` : id,
    entityId: id,
    changes: {
      reason: trimmedReason,
      complaints_deleted: (complaintCount ?? 0) > 0 ? complaintCount : 0,
    },
  })

  revalidatePath('/customers')
  redirect('/customers')
}

export async function createCustomer(
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

  const fullName = (formData.get('full_name') as string)?.trim()
  const mobileNumber = (formData.get('mobile_number') as string)?.trim()
  if (!fullName) return { error: 'Full name is required' }
  if (!mobileNumber) return { error: 'Mobile number is required' }

  const { data: customerCode } = await (supabase as any).rpc('generate_sequence_number', {
    p_org_id: orgId,
    p_type: 'customer',
    p_prefix: 'CUST',
  })

  const { error } = await (supabase as any).from('customers').insert({
    organization_id: orgId,
    customer_code: customerCode ?? `CUST-${Date.now()}`,
    customer_type: formData.get('customer_type') as string || 'individual',
    full_name: fullName,
    company_name: (formData.get('company_name') as string)?.trim() || null,
    contact_person: (formData.get('contact_person') as string)?.trim() || null,
    mobile_number: mobileNumber,
    whatsapp_number: (formData.get('whatsapp_number') as string)?.trim() || null,
    email: (formData.get('email') as string)?.trim() || null,
    address: (formData.get('address') as string)?.trim() || null,
    block: (formData.get('block') as string)?.trim() || null,
    street: (formData.get('street') as string)?.trim() || null,
    avenue: (formData.get('avenue') as string)?.trim() || null,
    house_number: (formData.get('house_number') as string)?.trim() || null,
    area: (formData.get('area') as string)?.trim() || null,
    city: (formData.get('city') as string)?.trim() || null,
    payment_terms: parseInt(formData.get('payment_terms') as string) || 0,
    credit_limit: parseFloat(formData.get('credit_limit') as string) || 0,
    print_name: (formData.get('print_name') as string)?.trim() || null,
    notes: (formData.get('notes') as string)?.trim() || null,
    status: 'active',
    created_by: user.id,
  })

  if (error) return { error: error.message }

  await logAudit({
    orgId,
    userId: user.id,
    userName: profile.full_name,
    action: 'create',
    entityType: 'customer',
    entityLabel: `${fullName} (${mobileNumber})`,
  })

  revalidatePath('/customers')
  // Return to wherever the user started — e.g. adding a customer part-way
  // through logging a complaint should land back on Complaints, not the
  // customer list. Only same-site paths are honoured.
  const returnTo = formData.get('return_to') as string | null
  if (returnTo?.startsWith('/') && !returnTo.startsWith('//')) {
    revalidatePath(returnTo)
    redirect(returnTo)
  }
  redirect('/customers')
}

export async function updateCustomer(
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
  if (!id) return { error: 'Customer ID missing' }

  const fullName = (formData.get('full_name') as string)?.trim()
  const mobileNumber = (formData.get('mobile_number') as string)?.trim()
  if (!fullName) return { error: 'Full name is required' }
  if (!mobileNumber) return { error: 'Mobile number is required' }

  const { error } = await (supabase as any).from('customers').update({
    customer_type: formData.get('customer_type') as string || 'individual',
    full_name: fullName,
    company_name: (formData.get('company_name') as string)?.trim() || null,
    contact_person: (formData.get('contact_person') as string)?.trim() || null,
    mobile_number: mobileNumber,
    whatsapp_number: (formData.get('whatsapp_number') as string)?.trim() || null,
    email: (formData.get('email') as string)?.trim() || null,
    address: (formData.get('address') as string)?.trim() || null,
    block: (formData.get('block') as string)?.trim() || null,
    street: (formData.get('street') as string)?.trim() || null,
    avenue: (formData.get('avenue') as string)?.trim() || null,
    house_number: (formData.get('house_number') as string)?.trim() || null,
    area: (formData.get('area') as string)?.trim() || null,
    city: (formData.get('city') as string)?.trim() || null,
    payment_terms: parseInt(formData.get('payment_terms') as string) || 0,
    credit_limit: parseFloat(formData.get('credit_limit') as string) || 0,
    print_name: (formData.get('print_name') as string)?.trim() || null,
    notes: (formData.get('notes') as string)?.trim() || null,
    status: (formData.get('status') as string) || 'active',
  }).eq('id', id).eq('organization_id', profile.organization_id)

  if (error) return { error: error.message }

  await logAudit({
    orgId: profile.organization_id,
    userId: user.id,
    userName: profile.full_name,
    action: 'update',
    entityType: 'customer',
    entityLabel: `${fullName} (${mobileNumber})`,
    entityId: id,
  })

  revalidatePath(`/customers/${id}`)
  revalidatePath('/customers')
  redirect(`/customers/${id}`)
}
