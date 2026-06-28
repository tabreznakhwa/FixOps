import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FileBarChart } from 'lucide-react'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'
import { LedgerCustomerSelector } from './LedgerCustomerSelector'

export const metadata = { title: 'Customer Ledger' }

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ customer_id?: string; from_date?: string; to_date?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await (supabase as any).from('users').select('organization_id').eq('id', user!.id).single()
  const orgId = (profileRaw as { organization_id: string } | null)?.organization_id
  const admin = createAdminClient() as any

  const { data: customersRaw } = await supabase
    .from('customers')
    .select('id, full_name, mobile_number, company_name')
    .eq('status', 'active')
    .order('full_name')
  const customers = (customersRaw ?? []) as unknown as Array<{
    id: string; full_name: string; mobile_number: string; company_name: string | null
  }>

  type LedgerRow = {
    id: string
    date: string
    description: string
    type: string
    reference: string | null
    debit: number
    credit: number
    running_balance: number
  }

  let ledgerRows: LedgerRow[] = []
  let selectedCustomer: typeof customers[0] | null = null

  if (params.customer_id) {
    selectedCustomer = customers.find(c => c.id === params.customer_id) ?? null

    const fromDate = params.from_date ?? null
    const toDate = params.to_date ?? null

    // Fetch invoices (debit entries — customer owes us)
    let invQuery = (supabase as any)
      .from('invoices')
      .select('id, invoice_number, invoice_date, total_amount, status')
      .eq('customer_id', params.customer_id)
      .not('status', 'in', '(cancelled,written_off)')
      .order('invoice_date', { ascending: true })
    if (fromDate) invQuery = invQuery.gte('invoice_date', fromDate)
    if (toDate) invQuery = invQuery.lte('invoice_date', toDate)
    const { data: invoicesRaw } = await invQuery

    // Fetch payments (credit entries — customer paid us)
    let payQuery = (supabase as any)
      .from('payments')
      .select('id, payment_number, payment_date, amount_received, payment_mode, is_advance, is_cancelled')
      .eq('customer_id', params.customer_id)
      .eq('is_cancelled', false)
      .order('payment_date', { ascending: true })
    if (fromDate) payQuery = payQuery.gte('payment_date', fromDate)
    if (toDate) payQuery = payQuery.lte('payment_date', toDate)
    const { data: paymentsRaw } = await payQuery

    // Fetch opening receivables (debit entries — pre go-live balances)
    let openingQuery = admin
      .from('opening_receivables')
      .select('id, invoice_ref, invoice_date, amount')
      .eq('customer_id', params.customer_id)
      .eq('organization_id', orgId)
      .order('invoice_date', { ascending: true })
    if (fromDate) openingQuery = openingQuery.gte('invoice_date', fromDate)
    const { data: openingRaw } = await openingQuery

    const invoices = (invoicesRaw ?? []) as unknown as Array<{
      id: string; invoice_number: string; invoice_date: string; total_amount: number; status: string
    }>
    const payments = (paymentsRaw ?? []) as unknown as Array<{
      id: string; payment_number: string; payment_date: string; amount_received: number; payment_mode: string; is_advance: boolean; is_cancelled: boolean
    }>
    const openingEntries = (openingRaw ?? []) as unknown as Array<{
      id: string; invoice_ref: string; invoice_date: string; amount: number
    }>

    // Merge into a single timeline
    type RawEntry = { date: string; description: string; type: string; reference: string | null; debit: number; credit: number }
    const merged: RawEntry[] = [
      ...openingEntries.map(op => ({
        date: op.invoice_date,
        description: `Opening Balance — ${op.invoice_ref}`,
        type: 'opening_balance',
        reference: op.invoice_ref,
        debit: op.amount,
        credit: 0,
      })),
      ...invoices.map(inv => ({
        date: inv.invoice_date,
        description: `Invoice ${inv.invoice_number}`,
        type: 'invoice',
        reference: inv.invoice_number,
        debit: inv.total_amount,
        credit: 0,
      })),
      ...payments.map(pay => ({
        date: pay.payment_date,
        description: `Payment ${pay.payment_number}${pay.is_advance ? ' (Advance)' : ''} — ${pay.payment_mode.replace(/_/g, ' ')}`,
        type: pay.is_advance ? 'advance' : 'payment',
        reference: pay.payment_number,
        debit: 0,
        credit: pay.amount_received,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date))

    // Compute running balance
    let running = 0
    ledgerRows = merged.map((row, i) => {
      running = running + row.debit - row.credit
      return { id: String(i), date: row.date, description: row.description, type: row.type, reference: row.reference, debit: row.debit, credit: row.credit, running_balance: running }
    })
  }

  const balance = ledgerRows.length ? ledgerRows[ledgerRows.length - 1].running_balance : 0

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Customer Ledger" subtitle="Account Statement" />
      </div>
      <Header title="Customer Ledger" subtitle="Account statement & transaction history"
        actions={<PrintActions />} />

      <div className="p-6 space-y-5">
        {/* Customer selector */}
        <LedgerCustomerSelector
          customers={customers}
          selectedId={params.customer_id ?? ''}
          fromDate={params.from_date ?? ''}
          toDate={params.to_date ?? ''}
        />

        {selectedCustomer && (
          <>
            {/* Balance summary */}
            <div className={`rounded-xl border p-5 ${balance > 0 ? 'bg-red-50 border-red-200' : balance < 0 ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{selectedCustomer.full_name}</p>
                  <p className="text-sm text-slate-500">{selectedCustomer.mobile_number}</p>
                  <p className="text-xs text-slate-400 mt-1">{ledgerRows.length} transaction{ledgerRows.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Current Balance</p>
                  <p className={`text-2xl font-bold ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-slate-900'}`}>
                    {formatCurrency(Math.abs(balance))}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {balance > 0 ? 'Amount Owed by Customer' : balance < 0 ? 'Credit / Advance Balance' : 'Settled'}
                  </p>
                </div>
              </div>
            </div>

            {/* Ledger table */}
            {!ledgerRows.length ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
                <FileBarChart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No transactions found</p>
                <p className="text-slate-400 text-sm mt-1">Invoices and payments for this customer will appear here.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Date</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Description</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Type</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Debit (KWD)</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Credit (KWD)</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Balance (KWD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {ledgerRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{formatDate(row.date)}</td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-slate-800">{row.description}</p>
                        </td>
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                            row.type === 'invoice' ? 'bg-blue-50 text-blue-700' :
                            row.type === 'payment' ? 'bg-green-50 text-green-700' :
                            row.type === 'opening_balance' ? 'bg-purple-50 text-purple-700' :
                            'bg-amber-50 text-amber-700'
                          }`}>
                            {row.type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-red-600">
                          {row.debit > 0 ? formatCurrency(row.debit) : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-green-600">
                          {row.credit > 0 ? formatCurrency(row.credit) : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className={`font-bold ${row.running_balance > 0 ? 'text-red-600' : row.running_balance < 0 ? 'text-green-600' : 'text-slate-900'}`}>
                            {formatCurrency(Math.abs(row.running_balance))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Footer totals */}
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={3} className="px-5 py-3.5 text-sm font-bold text-slate-700">Totals</td>
                      <td className="px-4 py-3.5 text-right text-sm font-bold text-red-600">
                        {formatCurrency(ledgerRows.reduce((s, r) => s + r.debit, 0))}
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm font-bold text-green-600">
                        {formatCurrency(ledgerRows.reduce((s, r) => s + r.credit, 0))}
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm font-bold text-slate-900">
                        {formatCurrency(Math.abs(balance))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}

        {!params.customer_id && (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
            <FileBarChart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Select a customer to view their ledger</p>
            <p className="text-slate-400 text-sm mt-1">Shows all invoices and payments with a running balance.</p>
          </div>
        )}
      </div>
    </div>
  )
}
