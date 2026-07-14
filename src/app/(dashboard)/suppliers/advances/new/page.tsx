import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { NewSupplierAdvanceForm } from './NewSupplierAdvanceForm'

export const metadata = { title: 'New Supplier Advance' }

export default async function NewSupplierAdvancePage({
  searchParams,
}: {
  searchParams: Promise<{ supplier_id?: string }>
}) {
  const { supplier_id } = await searchParams
  const supabase = await createClient()
  const admin = createAdminClient() as any

  const { data: suppliersRaw } = await (supabase as any)
    .from('suppliers')
    .select('id, supplier_name, supplier_code')
    .order('supplier_name')

  const suppliers = (suppliersRaw ?? []) as Array<{
    id: string; supplier_name: string; supplier_code: string
  }>

  return (
    <div className="animate-fade-in">
      <Header
        title="New Supplier Advance"
        subtitle="Record an advance payment to a supplier"
        actions={
          <Link
            href="/suppliers/advances"
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />
      <div className="p-6 max-w-xl">
        <NewSupplierAdvanceForm suppliers={suppliers} defaultSupplierId={supplier_id} />
      </div>
    </div>
  )
}
