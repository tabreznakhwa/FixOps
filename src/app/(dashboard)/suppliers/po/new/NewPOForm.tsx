'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Supplier {
  id: string
  supplier_name: string
}

interface LineItem {
  description: string
  category: string
  quantity: number
  unit_price: number
}

interface Props {
  suppliers: Supplier[]
  defaultSupplierId: string
}

const CATEGORIES = [
  'AC / HVAC',
  'Electrical',
  'Plumbing',
  'Mechanical',
  'Civil',
  'Tools & Equipment',
  'Consumables',
  'General',
]

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

function emptyItem(): LineItem {
  return { description: '', category: '', quantity: 1, unit_price: 0 }
}

export function NewPOForm({ suppliers, defaultSupplierId }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [items, setItems] = useState<LineItem[]>([emptyItem()])

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)

  function updateItem(index: number, field: keyof LineItem, value: string | number) {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()])
  }

  function removeItem(index: number) {
    if (items.length === 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    if (items.some((i) => !i.description.trim())) {
      setError('All line items must have a description')
      return
    }
    if (items.some((i) => i.quantity <= 0)) {
      setError('All quantities must be greater than zero')
      return
    }

    setLoading(true)

    const fd = new FormData(e.currentTarget)
    const body = {
      supplier_id: fd.get('supplier_id') as string,
      purchase_date: fd.get('purchase_date') as string,
      notes: fd.get('notes') as string,
      items: items.map((i) => ({
        description: i.description.trim(),
        category: i.category || null,
        quantity: i.quantity,
        unit_price: i.unit_price,
      })),
    }

    if (!body.supplier_id) {
      setError('Please select a supplier')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/suppliers/po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create purchase order')
        setLoading(false)
        return
      }
      window.location.href = '/suppliers?tab=po'
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Order Details</h2>

        <div>
          <label className={labelClass}>Supplier <span className="text-red-500">*</span></label>
          <select name="supplier_id" required defaultValue={defaultSupplierId} className={inputClass}>
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.supplier_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Purchase Date <span className="text-red-500">*</span></label>
          <input
            type="date"
            name="purchase_date"
            required
            defaultValue={new Date().toISOString().split('T')[0]}
            className={inputClass}
          />
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Line Items</h2>
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> Add Line
          </button>
        </div>

        {/* Header row */}
        <div className="grid grid-cols-12 gap-2 pb-1 border-b border-slate-100">
          <p className="col-span-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</p>
          <p className="col-span-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</p>
          <p className="col-span-2 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Qty</p>
          <p className="col-span-2 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Unit Price</p>
          <p className="col-span-1" />
        </div>

        {items.map((item, index) => (
          <div key={index} className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-4">
              <input
                type="text"
                value={item.description}
                onChange={(e) => updateItem(index, 'description', e.target.value)}
                placeholder="Item description"
                className={inputClass}
              />
            </div>
            <div className="col-span-3">
              <select
                value={item.category}
                onChange={(e) => updateItem(index, 'category', e.target.value)}
                className={inputClass}
              >
                <option value="">— Select —</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <input
                type="number"
                value={item.quantity}
                min="1"
                onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                className={`${inputClass} text-center`}
              />
            </div>
            <div className="col-span-2">
              <input
                type="number"
                value={item.unit_price}
                min="0"
                step="0.01"
                onChange={(e) => updateItem(index, 'unit_price', Number(e.target.value))}
                className={`${inputClass} text-right`}
              />
            </div>
            <div className="col-span-1 flex justify-center">
              <button
                type="button"
                onClick={() => removeItem(index)}
                disabled={items.length === 1}
                className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}

        {/* Total */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <p className="text-sm font-semibold text-slate-700">Total Amount</p>
          <p className="text-lg font-bold text-slate-900">{formatCurrency(total)}</p>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <label className={labelClass}>Notes</label>
        <textarea name="notes" rows={3} placeholder="Any notes or special instructions…" className={inputClass} />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Creating…' : 'Create Purchase Order'}
        </button>
        <a href="/suppliers?tab=po" className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-900 transition-colors">
          Cancel
        </a>
      </div>
    </form>
  )
}
