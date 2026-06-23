import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Layers } from 'lucide-react'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'

export const metadata = { title: 'Stock Trial' }

export default async function StockTrialPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; category?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 7) + '-01'
  const from = params.from ?? firstOfMonth
  const to = params.to ?? today

  // All active items
  const { data: itemsRaw } = await (supabase as any)
    .from('inventory_items')
    .select('id, item_code, item_name, category, unit_of_measure, current_stock, purchase_price, selling_price')
    .eq('is_active', true)
    .order('item_name')

  const items = (itemsRaw ?? []) as Array<{
    id: string; item_code: string; item_name: string; category: string | null
    unit_of_measure: string; current_stock: number; purchase_price: number; selling_price: number
  }>

  // Transactions in the period for all items
  const { data: txnsRaw } = await (supabase as any)
    .from('inventory_transactions')
    .select('item_id, transaction_type, quantity, unit_cost, stock_before, stock_after, created_at')
    .gte('created_at', from + 'T00:00:00')
    .lte('created_at', to + 'T23:59:59')

  const txns = (txnsRaw ?? []) as Array<{
    item_id: string; transaction_type: string; quantity: number
    unit_cost: number; stock_before: number; stock_after: number; created_at: string
  }>

  // Build stock trial per item
  type TrialRow = {
    id: string; item_code: string; item_name: string; category: string | null; uom: string
    opening: number; purchases: number; issued: number; returned: number
    damaged: number; adjusted: number; closing: number; purchase_price: number
  }

  const rows: TrialRow[] = items.map((item) => {
    const itemTxns = txns.filter((t) => t.item_id === item.id)

    const purchases = itemTxns.filter((t) => t.transaction_type === 'purchase').reduce((s, t) => s + t.quantity, 0)
    const issued = itemTxns.filter((t) => t.transaction_type === 'issued').reduce((s, t) => s + t.quantity, 0)
    const returned = itemTxns.filter((t) => t.transaction_type === 'returned').reduce((s, t) => s + t.quantity, 0)
    const damaged = itemTxns.filter((t) => t.transaction_type === 'damaged').reduce((s, t) => s + t.quantity, 0)
    const adjusted = itemTxns
      .filter((t) => t.transaction_type === 'adjustment')
      .reduce((s, t) => s + t.quantity, 0)

    // Opening = closing (current) - net movements during period
    const netMovement = purchases + returned - issued - damaged + adjusted
    const closing = item.current_stock
    const opening = closing - netMovement

    return {
      id: item.id, item_code: item.item_code, item_name: item.item_name,
      category: item.category, uom: item.unit_of_measure,
      opening, purchases, issued, returned, damaged, adjusted, closing,
      purchase_price: item.purchase_price,
    }
  }).filter((r) => params.category ? r.category === params.category : true)

  // Categories for filter
  const categories = [...new Set(items.map((i) => i.category).filter(Boolean))] as string[]

  const totalClosingValue = rows.reduce((s, r) => s + r.closing * r.purchase_price, 0)

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Stock Trial Balance" subtitle={`${formatDate(from)} to ${formatDate(to)}`} />
      </div>
      <Header title="Stock Trial" subtitle="Opening, movement and closing stock by item"
        actions={<PrintActions />} />

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
          {categories.length > 0 && (
            <select name="category" defaultValue={params.category ?? ''}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Apply
          </button>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Total Items</p>
            <p className="text-xl font-bold text-slate-900">{rows.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Total Purchased</p>
            <p className="text-xl font-bold text-green-600">{rows.reduce((s, r) => s + r.purchases, 0).toFixed(0)} units</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Total Issued</p>
            <p className="text-xl font-bold text-amber-600">{rows.reduce((s, r) => s + r.issued, 0).toFixed(0)} units</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Closing Value</p>
            <p className="text-xl font-bold text-blue-600">{formatCurrency(totalClosingValue)}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Stock Trial Balance</h3>
            <span className="text-xs text-slate-500">{rows.length} items</span>
          </div>
          {rows.length === 0 ? (
            <div className="p-10 text-center">
              <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No inventory items found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Item</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Category</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">UOM</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Opening</th>
                    <th className="text-right text-xs font-semibold text-green-700 uppercase tracking-wider px-4 py-3">Purchased</th>
                    <th className="text-right text-xs font-semibold text-green-600 uppercase tracking-wider px-4 py-3">Returned</th>
                    <th className="text-right text-xs font-semibold text-red-600 uppercase tracking-wider px-4 py-3">Issued</th>
                    <th className="text-right text-xs font-semibold text-orange-600 uppercase tracking-wider px-4 py-3">Damaged</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Adj</th>
                    <th className="text-right text-xs font-semibold text-blue-700 uppercase tracking-wider px-4 py-3">Closing</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((r) => (
                    <tr key={r.id} className={`hover:bg-slate-50 transition-colors ${r.closing < 0 ? 'bg-red-50' : ''}`}>
                      <td className="px-5 py-3">
                        <p className="text-sm font-semibold text-slate-800">{r.item_name}</p>
                        <p className="text-xs text-slate-400 font-mono">{r.item_code}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 capitalize">{r.category ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{r.uom}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">{r.opening.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-sm text-green-700 font-medium">{r.purchases > 0 ? r.purchases.toFixed(2) : '—'}</td>
                      <td className="px-4 py-3 text-right text-sm text-green-600">{r.returned > 0 ? r.returned.toFixed(2) : '—'}</td>
                      <td className="px-4 py-3 text-right text-sm text-red-600 font-medium">{r.issued > 0 ? r.issued.toFixed(2) : '—'}</td>
                      <td className="px-4 py-3 text-right text-sm text-orange-600">{r.damaged > 0 ? r.damaged.toFixed(2) : '—'}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-500">{r.adjusted !== 0 ? r.adjusted.toFixed(2) : '—'}</td>
                      <td className={`px-4 py-3 text-right text-sm font-bold ${r.closing < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                        {r.closing.toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-medium text-slate-700">
                        {formatCurrency(r.closing * r.purchase_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={9} className="px-5 py-3 text-sm font-bold text-slate-700">Total Closing Value</td>
                    <td className="px-4 py-3" />
                    <td className="px-5 py-3 text-right text-sm font-bold text-blue-700">{formatCurrency(totalClosingValue)}</td>
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
