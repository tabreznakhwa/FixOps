import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft, Package } from 'lucide-react'
import { OpeningStockForm } from './OpeningStockForm'

export const metadata = { title: 'Opening Stock' }

export default async function OpeningStockPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profileRaw } = await (supabase as any)
    .from('users').select('organization_id').eq('id', user!.id).single()
  const profile = profileRaw as { organization_id: string } | null

  const { data: items } = profile?.organization_id
    ? await (supabase as any)
        .from('inventory_items')
        .select('id, item_code, item_name, category, unit_of_measure, current_stock, purchase_price')
        .eq('organization_id', profile.organization_id)
        .eq('is_active', true)
        .order('item_name')
    : { data: [] }

  return (
    <div className="animate-fade-in">
      <Header
        title="Opening Stock"
        subtitle="Set quantities for all inventory items at go-live"
        actions={
          <Link href="/inventory" className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Inventory
          </Link>
        }
      />
      <div className="p-6">
        {!items?.length ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
            <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No inventory items found. Add items to inventory first.</p>
          </div>
        ) : (
          <OpeningStockForm items={items ?? []} />
        )}
      </div>
    </div>
  )
}
