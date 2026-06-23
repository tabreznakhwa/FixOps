'use client'

import { useState } from 'react'

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

export function NewInventoryItemForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const fd = new FormData(e.currentTarget)
    const body = {
      item_name: fd.get('item_name') as string,
      category: fd.get('category') as string,
      brand: fd.get('brand') as string,
      unit_of_measure: fd.get('unit_of_measure') as string,
      current_stock: Number(fd.get('current_stock') ?? 0),
      minimum_stock_level: Number(fd.get('minimum_stock_level') ?? 0),
      purchase_price: Number(fd.get('purchase_price') ?? 0),
      selling_price: Number(fd.get('selling_price') ?? 0),
      storage_location: fd.get('storage_location') as string,
    }

    if (!body.item_name?.trim()) {
      setError('Item name is required')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create item')
        setLoading(false)
        return
      }
      window.location.href = `/inventory/${data.id}`
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Item Details</h2>

        <div>
          <label className={labelClass}>Item Name <span className="text-red-500">*</span></label>
          <input type="text" name="item_name" required placeholder="e.g. AC Filter 12x12" className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Category</label>
            <select name="category" className={inputClass}>
              <option value="">Select category…</option>
              <option value="AC Parts">AC Parts</option>
              <option value="Plumbing">Plumbing</option>
              <option value="Electrical">Electrical</option>
              <option value="General">General</option>
              <option value="Tools">Tools</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Brand</label>
            <input type="text" name="brand" placeholder="e.g. Daikin" className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Unit of Measure</label>
          <select name="unit_of_measure" className={inputClass}>
            <option value="pcs">Pieces (pcs)</option>
            <option value="kg">Kilogram (kg)</option>
            <option value="litre">Litre</option>
            <option value="meter">Meter</option>
            <option value="box">Box</option>
            <option value="set">Set</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Storage Location</label>
          <input type="text" name="storage_location" placeholder="e.g. Shelf A-3" className={inputClass} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Stock Levels</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Current Stock</label>
            <input type="number" name="current_stock" min="0" defaultValue="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Minimum Stock Level</label>
            <input type="number" name="minimum_stock_level" min="0" defaultValue="0" className={inputClass} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Pricing (AED)</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Purchase Price</label>
            <input type="number" name="purchase_price" min="0" step="0.01" defaultValue="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Selling Price</label>
            <input type="number" name="selling_price" min="0" step="0.01" defaultValue="0" className={inputClass} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Adding…' : 'Add Item'}
        </button>
        <a href="/inventory" className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-900 transition-colors">
          Cancel
        </a>
      </div>
    </form>
  )
}
