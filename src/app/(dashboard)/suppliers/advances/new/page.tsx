import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
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
          <BackButton fallbackHref="/suppliers/advances" label="Back" />
        }
      />
      <div className="p-6 max-w-xl">
        <NewSupplierAdvanceForm suppliers={suppliers} defaultSupplierId={supplier_id} />
      </div>
    </div>
  )
}
