import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { VendorPaymentForm } from './VendorPaymentForm'

export const metadata = { title: 'Record Vendor Payment' }

export default async function NewVendorPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string }>
}) {
  const { po: poId } = await searchParams
  const supabase = await createClient()

  // Fetch all suppliers for dropdown
  const { data: suppliersRaw } = await (supabase as any)
    .from('suppliers')
    .select('id, supplier_name, supplier_code')
    .order('supplier_name')
  const suppliers = (suppliersRaw ?? []) as Array<{ id: string; supplier_name: string; supplier_code: string }>

  // Pre-fetch PO details if coming from a specific PO
  let defaultPO: { id: string; po_number: string; supplier_id: string; balance_due: number } | null = null
  if (poId) {
    const { data: poRaw } = await (supabase as any)
      .from('purchase_orders')
      .select('id, po_number, supplier_id, balance_due')
      .eq('id', poId)
      .single()
    defaultPO = poRaw ?? null
  }

  // Fetch open POs (with balance due) for the PO dropdown
  const { data: openPOsRaw } = await (supabase as any)
    .from('purchase_orders')
    .select('id, po_number, supplier_id, balance_due, total_amount')
    .gt('balance_due', 0)
    .not('status', 'eq', 'cancelled')
    .order('purchase_date', { ascending: false })
    .limit(100)
  const openPOs = (openPOsRaw ?? []) as Array<{
    id: string; po_number: string; supplier_id: string; balance_due: number; total_amount: number
  }>

  return (
    <div className="animate-fade-in">
      <Header
        title="Record Vendor Payment"
        subtitle="Record a payment made to a supplier"
        actions={
          <Link href="/suppliers/vendor-payments" className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />
      <div className="p-6 max-w-xl">
        <VendorPaymentForm suppliers={suppliers} openPOs={openPOs} defaultPO={defaultPO} />
      </div>
    </div>
  )
}
