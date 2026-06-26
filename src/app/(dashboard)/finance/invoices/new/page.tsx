import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NewInvoiceForm } from './NewInvoiceForm'

export const metadata = { title: 'New Invoice' }

export default async function NewInvoicePage() {
  const supabase = await createClient()

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
        <NewInvoiceForm customers={customers} workOrders={workOrders} />
      </div>
    </div>
  )
}
