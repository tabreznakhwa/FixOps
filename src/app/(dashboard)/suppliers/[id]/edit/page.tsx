import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
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
          <Link
            href={`/suppliers/${id}`}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Cancel
          </Link>
        }
      />
      <div className="p-6 max-w-2xl">
        <EditSupplierForm supplier={supplierRaw} />
      </div>
    </div>
  )
}
