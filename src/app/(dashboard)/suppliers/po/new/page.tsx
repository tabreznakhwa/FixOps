import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { NewPOForm } from './NewPOForm'
import { resolveBack } from '@/lib/backNav'

export const metadata = { title: 'New Purchase Order' }

export default async function NewPOPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier_id?: string; return_to?: string }>
}) {
  const params = await searchParams
  const back = resolveBack(params.return_to, '/suppliers?tab=po', 'Purchase Orders')
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
          <BackButton href={back.href} label={back.label} />
        }
      />
      <div className="p-6">
        <NewPOForm suppliers={suppliers} defaultSupplierId={params.supplier_id ?? ''} returnTo={back.href} />
      </div>
    </div>
  )
}
