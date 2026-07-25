import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { NewPOForm } from './NewPOForm'

export const metadata = { title: 'New Purchase Order' }

export default async function NewPOPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier_id?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: suppliersRaw } = await (supabase as any)
    .from('suppliers')
    .select('id, supplier_name')
    .eq('status', 'active')
    .order('supplier_name')

  const suppliers = (suppliersRaw ?? []) as Array<{
    id: string
    supplier_name: string
  }>

  return (
    <div className="animate-fade-in">
      <Header
        title="New Purchase Order"
        subtitle="Create a purchase order for a supplier"
        actions={
          <BackButton fallbackHref="/suppliers?tab=po" label="Back" />
        }
      />
      <div className="p-6">
        <NewPOForm suppliers={suppliers} defaultSupplierId={params.supplier_id ?? ''} />
      </div>
    </div>
  )
}
