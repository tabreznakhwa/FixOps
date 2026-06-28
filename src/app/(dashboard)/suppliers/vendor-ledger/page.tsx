import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FileBarChart } from 'lucide-react'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'
import { SupplierSelector } from './SupplierSelector'

export const metadata = { title: 'Vendor Ledger' }

export default async function VendorLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier_id?: string; from_date?: string; to_date?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await (supabase as any).from('users').select('organization_id').eq('id', user!.id).single()
  const orgId = (profileRaw as { organization_id: string } | null)?.organization_id
  const admin = createAdminClient() as any

  const { data: suppliersRaw } = await admin
    .from('suppliers')
    .select('id, supplier_name, supplier_code')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('supplier_name')

  const suppliers = (suppliersRaw ?? []) as Array<{ id: string; supplier_name: string; supplier_code: string }>

  type LedgerRow = {
    id: string; date: string; description: string; type: string
    reference: string | null; debit: number; credit: number; running_balance: number
  }

  let ledgerRows: LedgerRow[] = []
  let selectedSupplier: typeof suppliers[0] | null = null

  if (params.supplier_id) {
    selectedSupplier = suppliers.find(s => s.id === params.supplier_id) ?? null
    const fromDate = params.from_date ?? null
    const toDate = params.to_date ?? null

    // Opening payables (debit — we owe them from before go-live)
    let openingQuery = admin
      .from('opening_payables')
      .select('id, bill_ref, bill_date, amount')
      .eq('supplier_id', params.supplier_id)
      .eq('organization_id', orgId)
      .order('bill_date', { ascending: true })
    if (fromDate) openingQuery = openingQuery.gte('bill_date', fromDate)
    const { data: openingRaw } = await openingQuery

    // Purchase orders (debit — we owe them)
    let poQuery = admin
      .from('purchase_orders')
      .select('id, po_number, purchase_date, total_amount, status')
      .eq('supplier_id', params.supplier_id)
      .eq('organization_id', orgId)
      .not('status', 'in', '(cancelled)')
      .order('purchase_date', { ascending: true })
    if (fromDate) poQuery = poQuery.gte('purchase_date', fromDate)
    if (toDate) poQuery = poQuery.lte('purchase_date', toDate)
    const { data: posRaw } = await poQuery

    // Supplier payments (credit — we paid them)
    let payQuery = admin
      .from('supplier_payments')
      .select('id, payment_date, amount_paid, payment_mode, reference_number')
      .eq('supplier_id', params.supplier_id)
      .eq('organization_id', orgId)
      .order('payment_date', { ascending: true })
    if (fromDate) payQuery = payQuery.gte('payment_date', fromDate)
    if (toDate) payQuery = payQuery.lte('payment_date', toDate)
    const { data: paymentsRaw } = await payQuery

    const openingEntries = (openingRaw ?? []) as Array<{ id: string; bill_ref: string; bill_date: string; amount: number }>
    const pos = (posRaw ?? []) as Array<{ id: string; po_number: string; purchase_date: string; total_amount: number; status: string }>
    const payments = (paymentsRaw ?? []) as Array<{ id: string; payment_date: string; amount_paid: number; payment_mode: string; reference_number: string | null }>

    type RawEntry = { date: string; description: string; type: string; reference: string | null; debit: number; credit: number }
    const merged: RawEntry[] = [
      ...openingEntries.map(op => ({
        date: op.bill_date,
        description: `Opening Balance — ${op.bill_ref}`,
        type: 'opening_balance',
        reference: op.bill_ref,
        debit: op.amount,
        credit: 0,
      })),
      ...pos.map(po => ({
        date: po.purchase_date,
        description: `Purchase Order ${po.po_number}`,
        type: 'purchase_order',
        reference: po.po_number,
        debit: po.total_amount,
        credit: 0,
      })),
      ...payments.map(pay => ({
        date: pay.payment_date,
        description: `Payment — ${pay.payment_mode.replace(/_/g, ' ')}${pay.reference_number ? ` (${pay.reference_number})` : ''}`,
        type: 'payment',
        reference: pay.reference_number,
        debit: 0,
        credit: pay.amount_paid,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date))

    let running = 0
    ledgerRows = merged.map((row, i) => {
      running = running + row.debit - row.credit
      return { id: String(i), date: row.date, description: row.description, type: row.type, reference: row.reference, debit: row.debit, credit: row.credit, running_balance: running }
    })
  }

  const balance = ledgerRows.length ? ledgerRows[ledgerRows.length - 1].running_balance : 0

  const typeBadge: Record<string, string> = {
    opening_balance: 'bg-purple-50 text-purple-700',
    purchase_order: 'bg-blue-50 text-blue-700',
    payment: 'bg-green-50 text-green-700',
  }

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Vendor Ledger" subtitle="Supplier Account Statement" />
      </div>
      <Header title="Vendor Ledger" subtitle="Supplier account statement & transaction history"
        actions={<PrintActions />} />

      <div className="p-6 space-y-5">
        <SupplierSelector
          suppliers={suppliers}
          selectedId={params.supplier_id ?? ''}
          fromDate={params.from_date ?? ''}
          toDate={params.to_date ?? ''}
        />

        {selectedSupplier && (
          <>
            <div className={`rounded-xl border p-5 ${balance > 0 ? 'bg-red-50 border-red-200' : balance < 0 ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{selectedSupplier.supplier_name}</p>
                  <p className="text-sm text-slate-500">{selectedSupplier.supplier_code}</p>
                  <p className="text-xs text-slate-400 mt-1">{ledgerRows.length} transaction{ledgerRows.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Current Balance</p>
                  <p className={`text-2xl font-bold ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-slate-900'}`}>
                    {formatCurrency(Math.abs(balance))}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {balance > 0 ? 'Amount We Owe' : balance < 0 ? 'Overpaid / Credit' : 'Settled'}
                  </p>
                </div>
              </div>
            </div>

            {!ledgerRows.length ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
                <FileBarChart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No transactions found</p>
                <p className="text-slate-400 text-sm mt-1">Purchase orders and payments for this supplier will appear here.</p>
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
                          <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${typeBadge[row.type] ?? 'bg-slate-100 text-slate-600'}`}>
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

        {!params.supplier_id && (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
            <FileBarChart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Select a supplier to view their ledger</p>
            <p className="text-slate-400 text-sm mt-1">Shows opening balances, purchase orders and payments with a running balance.</p>
          </div>
        )}
      </div>
    </div>
  )
}
