import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NewPaymentForm } from './NewPaymentForm'

export const metadata = { title: 'Record Payment' }

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice_id?: string; customer_id?: string; amount?: string }>
}) {
  const params = await searchParams
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
    mobile_number: string
    company_name: string | null
  }>

  // Fetch all open invoices (issued / partial / overdue) for client-side filtering
  const { data: openInvoicesRaw } = await (supabase as any)
    .from('invoices')
    .select('id, invoice_number, total_amount, balance_due, customer_id, status')
    .in('status', ['issued', 'partial', 'overdue'])
    .order('invoice_date', { ascending: false })

  const openInvoices = (openInvoicesRaw ?? []) as unknown as Array<{
    id: string
    invoice_number: string
    total_amount: number
    balance_due: number
    customer_id: string
    status: string
  }>

  // If invoice_id provided, fetch that invoice to pre-fill details
  let prefilledInvoice: {
    id: string
    invoice_number: string
    total_amount: number
    balance_due: number
    customer_id: string
    status: string
  } | null = null

  if (params.invoice_id) {
    const { data: inv } = await (supabase as any)
      .from('invoices')
      .select('id, invoice_number, total_amount, balance_due, customer_id, status')
      .eq('id', params.invoice_id)
      .single()
    prefilledInvoice = inv ?? null
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Record Payment"
        subtitle="Record a customer payment receipt"
        actions={
          <Link
            href="/finance/payments"
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />

      <div className="p-6">
        <NewPaymentForm
          customers={customers}
          openInvoices={openInvoices}
          prefilledCustomerId={params.customer_id ?? prefilledInvoice?.customer_id ?? ''}
          prefilledInvoiceId={params.invoice_id ?? ''}
          prefilledAmount={params.amount ?? (prefilledInvoice ? String(prefilledInvoice.balance_due) : '')}
        />
      </div>
    </div>
  )
}
