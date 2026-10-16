import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { notFound } from 'next/navigation'
import { BackButton } from '@/components/ui/BackButton'
import { EditSupplierForm } from './EditSupplierForm'
import { resolveBack } from '@/lib/backNav'

export const metadata = { title: 'Edit Supplier' }

export default async function EditSupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ return_to?: string }>
}) {
  const { id } = await params
  const { return_to } = await searchParams
  const destination = resolveBack(return_to, `/suppliers/${id}`, 'Supplier')
  const supabase = await createClient()

  const { data: supplierRaw } = await (supabase as any)
    .from('suppliers')
    .select('id, supplier_name, contact_person, mobile_number, email, city, address, payment_terms, notes, status')
    .eq('id', id)
    .single()

  if (!supplierRaw) notFound()

  return (
    <div className="animate-fade-in">
      <Header
        title="Edit Supplier"
        subtitle="Update supplier information"
        actions={
          <BackButton href={destination.href} label="Cancel" />
        }
      />
      <div className="p-6 max-w-2xl">
        <EditSupplierForm supplier={supplierRaw} returnTo={destination.href} />
      </div>
    </div>
  )
}
