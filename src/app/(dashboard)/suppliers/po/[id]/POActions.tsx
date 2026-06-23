'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Package } from 'lucide-react'

interface POItem {
  id: string
  description: string
  quantity: number
  quantity_received: number
  unit_cost: number
}

interface Props {
  poId: string
  poStatus: string
  items: POItem[]
}

export function POActions({ poId, poStatus, items }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showReceive, setShowReceive] = useState(false)
  const [received, setReceived] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.id, i.quantity_received ?? 0]))
  )

  async function callApi(body: object) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/suppliers/po/${poId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Action failed'); return false }
      router.refresh()
      return true
    } catch { setError('Network error'); return false }
    finally { setLoading(false) }
  }

  async function handleReceive() {
    const receivedItems = items.map((i) => ({
      item_id: i.id,
      received_quantity: received[i.id] ?? 0,
    }))
    const ok = await callApi({ action: 'receive', received_items: receivedItems })
    if (ok) setShowReceive(false)
  }

  if (poStatus === 'cancelled' || poStatus === 'received') return null

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setShowReceive(!showReceive)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          <Package className="w-4 h-4" />
          {showReceive ? 'Cancel' : 'Receive Goods'}
        </button>

        {poStatus !== 'cancelled' && (
          <button
            onClick={() => callApi({ action: 'cancel' })}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            <XCircle className="w-4 h-4" /> Cancel PO
          </button>
        )}
      </div>

      {showReceive && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-green-900">Enter received quantities:</p>
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 bg-white rounded-lg px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{item.description}</p>
                <p className="text-xs text-slate-500">Ordered: {item.quantity}</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 whitespace-nowrap">Received:</label>
                <input
                  type="number"
                  min="0"
                  max={item.quantity}
                  value={received[item.id] ?? 0}
                  onChange={(e) => setReceived((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))}
                  className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-900 text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          ))}
          <button
            onClick={handleReceive}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            {loading ? 'Saving…' : 'Confirm Receipt'}
          </button>
        </div>
      )}
    </div>
  )
}
