import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { EditInvoiceForm } from './EditInvoiceForm'

export const metadata = { title: 'Edit Invoice' }

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Role guard — only admin/owner/manager
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileRaw } = await (supabase as any)
    .from('users').select('role').eq('id', user.id).single()
  const role = (profileRaw as { role: string } | null)?.role ?? ''
  if (!['admin', 'owner', 'manager'].includes(role)) redirect(`/finance/invoices/${id}`)

  const { data: invoiceRaw } = await (supabase as any)
    .from('invoices')
    .select('id, invoice_number, invoice_type, invoice_date, due_date, ref_number, status, discount_amount, notes, terms_and_conditions, customer_id, work_order_id')
    .eq('id', id)
    .single()

  if (!invoiceRaw) notFound()
  if (['cancelled', 'paid'].includes(invoiceRaw.status)) redirect(`/finance/invoices/${id}`)

  const { data: itemsRaw } = await (supabase as any)
    .from('invoice_items')
    .select('id, description, quantity, unit_price, sort_order')
    .eq('invoice_id', id)
    .order('sort_order')

  const { data: customersRaw } = await supabase
    .from('customers')
    .select('id, full_name, mobile_number, company_name')
    .eq('status', 'active')
    .order('full_name')
    .limit(5000)

  const { data: workOrdersRaw } = await supabase
    .from('work_orders')
    .select('id, work_order_number, final_amount, customer_id')
    .not('status', 'in', '(cancelled)')
    .order('created_at', { ascending: false })
    .limit(200)

  const { data: inventoryRaw } = await (supabase as any)
    .from('inventory_items')
    .select('id, item_code, item_name, selling_price, unit_of_measure, current_stock, category')
    .eq('is_active', true)
    .order('item_name')
    .limit(2000)

  return (
    <div className="animate-fade-in">
      <Header
        title={`Edit ${invoiceRaw.invoice_number}`}
        subtitle="Update invoice details and line items"
        actions={
          <Link
            href={`/finance/invoices/${id}`}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Cancel
          </Link>
        }
      />
      <div className="p-6">
        <EditInvoiceForm
          invoice={invoiceRaw as any}
          items={(itemsRaw ?? []) as any[]}
          customers={(customersRaw ?? []) as any[]}
          workOrders={(workOrdersRaw ?? []) as any[]}
          inventoryItems={(inventoryRaw ?? []) as any[]}
        />
      </div>
    </div>
  )
}
