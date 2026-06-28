import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NewPurchaseInvoiceForm } from './NewPurchaseInvoiceForm'

export const metadata = { title: 'New Purchase Invoice' }

export default async function NewPurchaseInvoicePage() {
  const supabase = await createClient()
  const admin = createAdminClient() as any

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await admin.from('users').select('organization_id').eq('id', user!.id).single()
  const orgId = (profileRaw as { organization_id: string } | null)?.organization_id

  const [suppliersRes, inventoryRes] = await Promise.all([
    admin.from('suppliers')
      .select('id, supplier_name, supplier_code')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('supplier_name'),
    admin.from('inventory_items')
      .select('id, item_code, item_name, category, unit_of_measure, current_stock, purchase_price')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('item_name')
      .limit(2000),
  ])

  const suppliers = (suppliersRes.data ?? []) as Array<{ id: string; supplier_name: string; supplier_code: string }>
  const inventoryItems = (inventoryRes.data ?? []) as Array<{
    id: string; item_code: string; item_name: string; category: string | null
    unit_of_measure: string; current_stock: number; purchase_price: number
  }>

  return (
    <div className="animate-fade-in">
      <Header
        title="New Purchase Invoice"
        subtitle="Record a purchase and update inventory"
        actions={
          <Link href="/inventory/purchase-invoices"
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />
      <div className="p-6">
        <NewPurchaseInvoiceForm suppliers={suppliers} inventoryItems={inventoryItems} />
      </div>
    </div>
  )
}
