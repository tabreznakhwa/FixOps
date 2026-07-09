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

  // Fetch invoice first to get customer_id
  let prefilledInvoice: {
    id: string; invoice_number: string; total_amount: number
    balance_due: number; customer_id: string; status: string
  } | null = null

  if (params.invoice_id) {
    const { data: inv } = await (supabase as any)
      .from('invoices')
      .select('id, invoice_number, total_amount, balance_due, customer_id, status')
      .eq('id', params.invoice_id)
      .single()
    prefilledInvoice = inv ?? null
  }

  const prefilledCustomerId = params.customer_id || prefilledInvoice?.customer_id || ''

  // Fetch the pre-filled customer name to show it immediately (bypasses row-limit issue)
  let prefilledCustomerName = ''
  if (prefilledCustomerId) {
    const { data: cust } = await (supabase as any)
      .from('customers')
      .select('full_name')
      .eq('id', prefilledCustomerId)
      .single()
    prefilledCustomerName = (cust as { full_name: string } | null)?.full_name ?? ''
  }

  // Fetch open invoices for the invoice dropdown
  const { data: openInvoicesRaw } = await (supabase as any)
    .from('invoices')
    .select('id, invoice_number, total_amount, balance_due, customer_id, status')
    .in('status', ['issued', 'partial', 'overdue'])
    .order('invoice_date', { ascending: false })

  const openInvoices = (openInvoicesRaw ?? []) as Array<{
    id: string; invoice_number: string; total_amount: number
    balance_due: number; customer_id: string; status: string
  }>

  return (
    <div className="animate-fade-in">
      <Header
        title="Record Payment"
        subtitle="Record a customer payment receipt"
        actions={
          <Link href="/finance/payments"
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />
      <div className="p-6">
        <NewPaymentForm
          openInvoices={openInvoices}
          prefilledCustomerId={prefilledCustomerId}
          prefilledCustomerName={prefilledCustomerName}
          prefilledInvoiceId={params.invoice_id ?? ''}
          prefilledAmount={params.amount ?? (prefilledInvoice ? String(prefilledInvoice.balance_due) : '')}
        />
      </div>
    </div>
  )
}
