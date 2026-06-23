'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logAudit } from '@/lib/audit'

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
    area: (formData.get('area') as string)?.trim() || null,
    city: (formData.get('city') as string)?.trim() || null,
    payment_terms: parseInt(formData.get('payment_terms') as string) || 0,
    credit_limit: parseFloat(formData.get('credit_limit') as string) || 0,
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
  redirect('/customers')
}
