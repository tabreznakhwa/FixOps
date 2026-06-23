import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ShoppingCart, Plus } from 'lucide-react'
import Link from 'next/link'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'

export const metadata = { title: 'Purchase Invoice Register' }

const statusColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  submitted: 'bg-blue-100 text-blue-700',
  received: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
}

export default async function PurchaseRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; supplier?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 7) + '-01'
  const from = params.from ?? firstOfMonth
  const to = params.to ?? today

  let query = (supabase as any)
    .from('purchase_orders')
    .select('id, po_number, purchase_date, total_amount, amount_paid, balance_due, payment_status, status, suppliers(id, supplier_name, supplier_code)')
    .gte('purchase_date', from)
    .lte('purchase_date', to)
    .order('purchase_date', { ascending: false })

  if (params.supplier) query = query.eq('supplier_id', params.supplier)

  const { data: posRaw } = await query.limit(200)
  const pos = (posRaw ?? []) as Array<{
    id: string; po_number: string; purchase_date: string
    total_amount: number; amount_paid: number
    balance_due: number; payment_status: string; status: string
    suppliers: { id: string; supplier_name: string; supplier_code: string } | null
  }>

  const totals = pos.reduce(
    (acc, p) => ({ total: acc.total + p.total_amount, paid: acc.paid + p.amount_paid, balance: acc.balance + p.balance_due }),
    { total: 0, paid: 0, balance: 0 }
  )

  const pStatusColor: Record<string, string> = {
    unpaid: 'bg-red-100 text-red-700', partial: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700',
  }

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Purchase Invoice Register" subtitle={`${formatDate(from)} to ${formatDate(to)}`} />
      </div>
      <Header title="Purchase Invoice Register" subtitle="All purchase orders and invoices from suppliers"
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Link href="/suppliers/po/new" className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="w-4 h-4" /> New Purchase Order
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

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Purchases', value: totals.total, color: 'text-slate-900' },
            { label: 'Amount Paid', value: totals.paid, color: 'text-green-600' },
            { label: 'Balance Due', value: totals.balance, color: 'text-red-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wider">{s.label}</p>
              <p className={`text-lg font-bold ${s.color}`}>{formatCurrency(s.value)}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Purchase Register</h3>
            <span className="text-xs text-slate-500">{pos.length} records · {formatDate(from)} to {formatDate(to)}</span>
          </div>

          {pos.length === 0 ? (
            <div className="p-10 text-center">
              <ShoppingCart className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No purchase orders in this period</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">PO #</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Supplier</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Date</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Total</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Paid</th>
                    <th className="text-right text-xs font-semibold text-red-600 uppercase tracking-wider px-5 py-3">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pos.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/suppliers/po/${po.id}`} className="text-sm font-mono text-blue-600 hover:text-blue-700 font-semibold">
                          {po.po_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">{po.suppliers?.supplier_name}</p>
                        <p className="text-xs text-slate-400 font-mono">{po.suppliers?.supplier_code}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{formatDate(po.purchase_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${statusColors[po.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {po.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">{formatCurrency(po.total_amount)}</td>
                      <td className="px-4 py-3 text-right text-sm text-green-700">{formatCurrency(po.amount_paid)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pStatusColor[po.payment_status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {formatCurrency(po.balance_due)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={4} className="px-5 py-3 text-sm font-bold text-slate-700">Total</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">{formatCurrency(totals.total)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-700">{formatCurrency(totals.paid)}</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(totals.balance)}</td>
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
