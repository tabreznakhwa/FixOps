'use client'

import { useState } from 'react'
import { Plus, Minus, EyeOff } from 'lucide-react'

interface Props {
  itemId: string
  currentStock: number
  unitOfMeasure: string
  isActive: boolean
}

export function InventoryActions({ itemId, currentStock, unitOfMeasure, isActive }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [localStock, setLocalStock] = useState(currentStock)
  const [localActive, setLocalActive] = useState(isActive)
  const [adjustQty, setAdjustQty] = useState(1)

  async function patch(payload: Record<string, unknown>) {
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/inventory/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to update')
        return
      }
      if (data.item?.current_stock !== undefined) setLocalStock(data.item.current_stock)
      if (data.item?.is_active !== undefined) setLocalActive(data.item.is_active)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function addStock() {
    const qty = Math.max(1, adjustQty)
    patch({ current_stock: localStock + qty })
  }

  function removeStock() {
    const qty = Math.max(1, adjustQty)
    if (localStock - qty < 0) {
      setError('Stock cannot go below zero')
      return
    }
    patch({ current_stock: localStock - qty })
  }

  function toggleActive() {
    patch({ is_active: !localActive })
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">
          {error}
        </div>
      )}

      {/* Stock Adjustment */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Stock Adjustment</h3>

        <div className="text-center mb-4">
          <p className="text-3xl font-bold text-slate-900">{localStock}</p>
          <p className="text-xs text-slate-400 mt-0.5">{unitOfMeasure} in stock</p>
        </div>

        <div className="mb-3">
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Quantity</label>
          <input
            type="number"
            min="1"
            value={adjustQty}
            onChange={(e) => setAdjustQty(Math.max(1, Number(e.target.value)))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-center font-semibold"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={addStock}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-50 border border-green-200 text-green-700 text-sm font-semibold rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Stock
          </button>
          <button
            onClick={removeStock}
            disabled={loading || localStock === 0}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-orange-50 border border-orange-200 text-orange-700 text-sm font-semibold rounded-lg hover:bg-orange-100 disabled:opacity-50 transition-colors"
          >
            <Minus className="w-4 h-4" />
            Remove
          </button>
        </div>

        {loading && (
          <p className="text-xs text-slate-400 text-center mt-2">Updating…</p>
        )}
      </div>

      {/* Active/Inactive toggle */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Visibility</h3>
        <button
          onClick={toggleActive}
          disabled={loading}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg border transition-colors disabled:opacity-50 ${
            localActive
              ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
              : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
          }`}
        >
          <EyeOff className="w-4 h-4" />
          {localActive ? 'Mark as Inactive' : 'Mark as Active'}
        </button>
      </div>
    </div>
  )
}
