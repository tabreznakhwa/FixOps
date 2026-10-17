'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Banknote, Loader2, Undo2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Advance {
  id: string
  advance_number: string
  advance_date: string
  balance: number
  payment_mode: string
}

interface AppliedAdvance {
  id: string
  advance_id: string
  advance_number: string
  amount: number
}

interface Props {
  invoiceId: string
  advances: Advance[]
  appliedAdvances: AppliedAdvance[]
}

export function PurchaseInvoiceAdvanceActions({
  invoiceId,
  advances,
  appliedAdvances,
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function changeAllocation(action: 'apply' | 'unapply', advanceId: string) {
    setError('')
    setLoading(`${action}:${advanceId}`)
    try {
      const response = await fetch(`/api/supplier-advances/${advanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          purchase_invoice_id: invoiceId,
        }),
      })
      const payload = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) {
        setError(payload?.error ?? `Failed to ${action} advance`)
        return
      }
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  if (advances.length === 0 && appliedAdvances.length === 0) return null

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="flex items-center gap-2 font-semibold text-slate-900">
          <Banknote className="h-4 w-4 text-amber-500" />
          Supplier Advances
        </h3>
      </div>
      <div className="space-y-4 p-5">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {appliedAdvances.length > 0 && (
          <div className="space-y-2.5 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs font-bold text-blue-800">Applied to this invoice</p>
            {appliedAdvances.map((allocation) => (
              <div key={allocation.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-mono font-semibold text-slate-800">{allocation.advance_number}</p>
                  <p className="text-xs text-slate-500">Applied: {formatCurrency(allocation.amount)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => changeAllocation('unapply', allocation.advance_id)}
                  disabled={loading !== null}
                  className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
                >
                  {loading === `unapply:${allocation.advance_id}`
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Undo2 className="h-3 w-3" />}
                  Unapply
                </button>
              </div>
            ))}
          </div>
        )}

        {advances.length > 0 && (
          <div className="space-y-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-bold text-amber-800">
              Apply an advance to reduce this invoice&apos;s balance due
            </p>
            {advances.map((advance) => (
              <div key={advance.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-mono font-semibold text-slate-800">{advance.advance_number}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(advance.advance_date)} · Balance: {formatCurrency(advance.balance)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => changeAllocation('apply', advance.id)}
                  disabled={loading !== null}
                  className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
                >
                  {loading === `apply:${advance.id}` && <Loader2 className="h-3 w-3 animate-spin" />}
                  Apply
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
