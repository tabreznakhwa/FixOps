'use client'

import { useState } from 'react'
import { Banknote, Loader2, AlertCircle } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Advance {
  id: string
  advance_number: string
  advance_date: string
  balance: number
  payment_mode: string
}

interface Props {
  invoiceId: string
  advances: Advance[]
}

export function PurchaseInvoiceAdvanceActions({ invoiceId, advances }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  const applyAdvance = async (advanceId: string) => {
    setError('')
    setLoading(advanceId)
    try {
      const res = await fetch(`/api/supplier-advances/${advanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply_to_purchase_invoice_id: invoiceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to apply advance')
      window.location.reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to apply advance')
      setLoading(null)
    }
  }

  if (advances.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Banknote className="w-4 h-4 text-amber-500" />
          Supplier Advance Available
        </h3>
      </div>
      <div className="p-5 space-y-3">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2.5">
          <p className="text-xs font-bold text-amber-800">
            Apply an advance to reduce this invoice's balance due
          </p>
          {advances.map((adv) => (
            <div key={adv.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-mono font-semibold text-slate-800">{adv.advance_number}</p>
                <p className="text-xs text-slate-500">
                  {formatDate(adv.advance_date)} · Balance: {formatCurrency(adv.balance)}
                </p>
              </div>
              <button
                onClick={() => applyAdvance(adv.id)}
                disabled={loading === adv.id}
                className="flex-shrink-0 text-xs font-bold px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition disabled:opacity-50 flex items-center gap-1"
              >
                {loading === adv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Apply
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
