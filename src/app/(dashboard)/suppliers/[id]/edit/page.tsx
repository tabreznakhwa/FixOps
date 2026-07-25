import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BackButton } from '@/components/ui/BackButton'
import { EditSupplierForm } from './EditSupplierForm'

export const metadata = { title: 'Edit Supplier' }

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
          <BackButton fallbackHref={`/suppliers/${id}`} label="Cancel" />
        }
      />
      <div className="p-6 max-w-2xl">
        <EditSupplierForm supplier={supplierRaw} />
      </div>
    </div>
  )
}
