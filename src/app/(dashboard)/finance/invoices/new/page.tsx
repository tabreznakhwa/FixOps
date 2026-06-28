import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NewInvoiceForm } from './NewInvoiceForm'

export const metadata = { title: 'New Invoice' }

export default async function NewInvoicePage() {
  const supabase = await createClient()
  const admin = createAdminClient() as any

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await admin.from('users').select('organization_id').eq('id', user!.id).single()
  const orgId = (profileRaw as { organization_id: string } | null)?.organization_id

  const { data: customersRaw } = await supabase
    .from('customers')
    .select('id, full_name, mobile_number, company_name')
    .eq('status', 'active')
    .order('full_name')
    .limit(5000)

  const customers = (customersRaw ?? []) as unknown as Array<{
    id: string
    full_name: string
    mobile_number: string | null
    company_name: string | null
  }>

  const { data: workOrdersRaw } = await (supabase as any)
    .from('work_orders')
    .select('id, work_order_number, final_amount, customer_id')
    .in('status', ['completed', 'verified'])
    .not('payment_status', 'eq', 'paid')
    .order('created_at', { ascending: false })

  const workOrders = (workOrdersRaw ?? []) as unknown as Array<{
    id: string
    work_order_number: string
    final_amount: number
    customer_id: string
  }>

  const [inventoryRaw, woServicesRaw, invServicesRaw] = await Promise.all([
    admin.from('inventory_items')
      .select('id, item_code, item_name, selling_price, unit_of_measure, current_stock, category')
      .eq('is_active', true).order('item_name').limit(2000),
    admin.from('work_order_line_items')
      .select('description').eq('organization_id', orgId)
      .in('item_type', ['service', 'custom']).order('description'),
    admin.from('invoice_items')
      .select('description').eq('organization_id', orgId).order('description'),
  ])

  const inventoryItems = (inventoryRaw.data ?? []) as unknown as Array<{
    id: string
    item_code: string
    item_name: string
    selling_price: number
    unit_of_measure: string
    current_stock: number
    category: string | null
  }>

  const customServices = [
    ...new Set([
      ...(woServicesRaw.data ?? []).map((r: { description: string }) => r.description),
      ...(invServicesRaw.data ?? []).map((r: { description: string }) => r.description),
    ]),
  ].filter(Boolean).sort() as string[]

  return (
    <div className="animate-fade-in">
      <Header
        title="New Invoice"
        subtitle="Create a new invoice"
        actions={
          <Link
            href="/finance/invoices"
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />

      <div className="p-6">
        <NewInvoiceForm customers={customers} workOrders={workOrders} inventoryItems={inventoryItems} customServices={customServices} />
      </div>
    </div>
  )
}
