import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
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
          <Link
            href="/suppliers?tab=po"
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />
      <div className="p-6">
        <NewPOForm suppliers={suppliers} defaultSupplierId={params.supplier_id ?? ''} />
      </div>
    </div>
  )
}
