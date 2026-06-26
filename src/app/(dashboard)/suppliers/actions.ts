'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logAudit } from '@/lib/audit'

export async function updateSupplier(
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
  if (!id) return { error: 'Supplier ID missing' }

  const supplierName = (formData.get('supplier_name') as string)?.trim()
  if (!supplierName) return { error: 'Supplier name is required' }

  const { error } = await (supabase as any).from('suppliers').update({
    supplier_name: supplierName,
    contact_person: (formData.get('contact_person') as string)?.trim() || null,
    mobile_number: (formData.get('mobile_number') as string)?.trim() || null,
    email: (formData.get('email') as string)?.trim() || null,
    city: (formData.get('city') as string)?.trim() || null,
    address: (formData.get('address') as string)?.trim() || null,
    payment_terms: parseInt(formData.get('payment_terms') as string) || 0,
    notes: (formData.get('notes') as string)?.trim() || null,
    status: (formData.get('status') as string) || 'active',
  }).eq('id', id).eq('organization_id', profile.organization_id)

  if (error) return { error: error.message }

  await logAudit({
    orgId: profile.organization_id,
    userId: user.id,
    userName: profile.full_name,
    action: 'update',
    entityType: 'supplier',
    entityLabel: supplierName,
    entityId: id,
  })

  revalidatePath(`/suppliers/${id}`)
  revalidatePath('/suppliers')
  redirect(`/suppliers/${id}`)
}
