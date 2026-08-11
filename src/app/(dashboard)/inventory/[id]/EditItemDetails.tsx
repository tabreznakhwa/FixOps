'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Loader2 } from 'lucide-react'

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

interface Props {
  itemId: string
  itemName: string
  category: string | null
  brand: string | null
  unitOfMeasure: string
}

/**
 * Renames an item and corrects its category, brand and unit.
 *
 * Deliberately excludes current_stock — quantity changes belong in the stock
 * adjustment control below, which is the audited path. This is for fixing a
 * typo in the name, not for moving stock.
 */
export function EditItemDetails({ itemId, itemName, category, brand, unitOfMeasure }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    item_name: itemName,
    category: category ?? '',
    brand: brand ?? '',
    unit_of_measure: unitOfMeasure,
  })

  async function save() {
    if (!form.item_name.trim()) { setError('Item name is required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/inventory/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_name: form.item_name.trim(),
          category: form.category.trim() || null,
          brand: form.brand.trim() || null,
          unit_of_measure: form.unit_of_measure.trim() || 'pcs',
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to update item'); return }
      setEditing(false)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setForm({ item_name: itemName, category: category ?? '', brand: brand ?? '', unit_of_measure: unitOfMeasure }); setEditing(true) }}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
      >
        <Pencil className="w-4 h-4" /> Edit Details
      </button>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-blue-200 p-5 space-y-3">
      <h3 className="font-semibold text-slate-900 text-sm">Edit Item Details</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">Item Name *</label>
          <input
            className={inputCls}
            value={form.item_name}
            onChange={e => setForm({ ...form, item_name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
          <input
            className={inputCls}
            value={form.category}
            onChange={e => setForm({ ...form, category: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Brand</label>
          <input
            className={inputCls}
            value={form.brand}
            onChange={e => setForm({ ...form, brand: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Unit of Measure</label>
          <input
            className={inputCls}
            value={form.unit_of_measure}
            onChange={e => setForm({ ...form, unit_of_measure: e.target.value })}
            placeholder="pcs"
          />
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Quantity is not changed here — use the stock adjustment control to move stock.
      </p>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg disabled:opacity-60 transition"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save
        </button>
        <button
          onClick={() => { setEditing(false); setError('') }}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 transition"
        >
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
      </div>
    </div>
  )
}
