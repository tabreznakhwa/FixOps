'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Item {
  id: string
  item_code: string
  item_name: string
  category: string | null
  unit_of_measure: string
  current_stock: number
  purchase_price: number
}

export function OpeningStockForm({ items }: { items: Item[] }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(items.map(i => [i.id, String(i.current_stock || 0)]))
  )
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  async function handleSave() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const payload = items.map(i => ({ id: i.id, qty: parseFloat(quantities[i.id] || '0') || 0 }))
      const res = await fetch('/api/inventory/opening-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload, date }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSaved(true)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const totalValue = items.reduce((s, i) => s + (parseFloat(quantities[i.id] || '0') || 0) * i.purchase_price, 0)

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> Opening stock saved. All quantities updated.
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
        Enter the actual quantity of each item you have in stock right now. Do this once before any purchase orders or stock adjustments.
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Opening Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-wider">Total Stock Value</p>
            <p className="text-base font-bold text-slate-900">{formatCurrency(totalValue)}</p>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : `Save Opening Stock (${items.length} items)`}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Item</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Category</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Unit</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Purchase Price</th>
                <th className="text-right text-xs font-semibold text-blue-500 uppercase tracking-wider px-5 py-3">Opening Qty ✎</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-sm font-semibold text-slate-800">{item.item_name}</p>
                    <p className="text-xs text-slate-400 font-mono">{item.item_code}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.category ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.unit_of_measure}</td>
                  <td className="px-4 py-3 text-right text-sm text-slate-600">{formatCurrency(item.purchase_price)}</td>
                  <td className="px-5 py-3 text-right">
                    <input
                      type="number" min="0" step="1"
                      value={quantities[item.id] ?? '0'}
                      onChange={e => setQuantities(prev => ({ ...prev, [item.id]: e.target.value }))}
                      className="w-28 text-right border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
