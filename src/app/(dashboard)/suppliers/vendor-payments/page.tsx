import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { TrendingDown, Plus } from 'lucide-react'
import Link from 'next/link'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'

export const metadata = { title: 'Vendor Payment Register' }

const MODE_LABELS: Record<string, string> = {
  cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque',
  pos: 'POS', online: 'Online', card: 'Card', other: 'Other',
}

const MODE_COLORS: Record<string, string> = {
  cash: 'bg-green-100 text-green-700', bank_transfer: 'bg-blue-100 text-blue-700',
  cheque: 'bg-purple-100 text-purple-700', pos: 'bg-amber-100 text-amber-700',
  online: 'bg-cyan-100 text-cyan-700', card: 'bg-indigo-100 text-indigo-700',
  other: 'bg-slate-100 text-slate-600',
}

export default async function VendorPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 7) + '-01'
  const from = params.from ?? firstOfMonth
  const to = params.to ?? today

  const { data: paymentsRaw } = await (supabase as any)
    .from('supplier_payments')
    .select('id, payment_date, amount_paid, payment_mode, reference_number, notes, suppliers(supplier_name, supplier_code), purchase_orders(po_number)')
    .gte('payment_date', from)
    .lte('payment_date', to)
    .order('payment_date', { ascending: false })
    .limit(200)

  const payments = (paymentsRaw ?? []) as Array<{
    id: string; payment_date: string; amount_paid: number; payment_mode: string
    reference_number: string | null; notes: string | null
    suppliers: { supplier_name: string; supplier_code: string } | null
    purchase_orders: { po_number: string } | null
  }>

  const totalPaid = payments.reduce((s, p) => s + p.amount_paid, 0)

  // Group by mode
  const byMode = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.payment_mode] = (acc[p.payment_mode] ?? 0) + p.amount_paid
    return acc
  }, {})

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Vendor Payment Register" subtitle={`${formatDate(from)} to ${formatDate(to)}`} />
      </div>
      <Header title="Vendor Payment Register" subtitle="All payments made to suppliers"
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Link href="/suppliers/vendor-payments/new" className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="w-4 h-4" /> Record Payment
            </Link>
            <PrintActions />
          </div>
        } />

      <div className="p-6 space-y-5">
        <form method="get" className="flex items-center gap-3 flex-wrap print:hidden">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <label className="font-medium">From</label>
            <input type="date" name="from" defaultValue={from}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <label className="font-medium">To</label>
            <input type="date" name="to" defaultValue={to}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Apply
          </button>
        </form>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:col-span-2">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Total Paid</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totalPaid)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{payments.length} payments · {formatDate(from)} to {formatDate(to)}</p>
          </div>
          {Object.entries(byMode).map(([mode, amt]) => (
            <div key={mode} className="bg-white rounded-xl border border-slate-200 p-4">
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${MODE_COLORS[mode] ?? 'bg-slate-100 text-slate-600'}`}>
                {MODE_LABELS[mode] ?? mode}
              </span>
              <p className="text-base font-bold text-slate-800">{formatCurrency(amt)}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Payment Register</h3>
          </div>

          {payments.length === 0 ? (
            <div className="p-10 text-center">
              <TrendingDown className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No vendor payments in this period</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Date</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Supplier</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">PO #</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Mode</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Reference</th>
                    <th className="text-right text-xs font-semibold text-red-600 uppercase tracking-wider px-5 py-3">Amount Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(p.payment_date)}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">{p.suppliers?.supplier_name}</p>
                        <p className="text-xs text-slate-400 font-mono">{p.suppliers?.supplier_code}</p>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-blue-600">{p.purchase_orders?.po_number ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${MODE_COLORS[p.payment_mode] ?? 'bg-slate-100 text-slate-600'}`}>
                          {MODE_LABELS[p.payment_mode] ?? p.payment_mode}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400 font-mono">{p.reference_number ?? '—'}</td>
                      <td className="px-5 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(p.amount_paid)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={5} className="px-5 py-3 text-sm font-bold text-slate-700">Total</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(totalPaid)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
