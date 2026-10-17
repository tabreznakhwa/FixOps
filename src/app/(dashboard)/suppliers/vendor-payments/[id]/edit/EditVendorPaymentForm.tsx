'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { safeReturnTo } from '@/lib/backNav'

interface Props {
  payment: {
    id: string
    payment_date: string
    amount_paid: number
    discount_amount: number | null
    payment_mode: string
    reference_number: string | null
    suppliers: { supplier_name: string; supplier_code: string } | null
    purchase_invoices: { invoice_number: string } | null
  }
  returnTo: string
}

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white'

export function EditVendorPaymentForm({ payment, returnTo }: Props) {
  const router = useRouter()
  const destination = safeReturnTo(returnTo) ?? '/suppliers/vendor-payments'
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cancellationReason = reason.trim()
    if (!cancellationReason) {
      setError('Cancellation reason is required')
      return
    }

    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/suppliers/payments/${payment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', reason: cancellationReason }),
      })
      const data = await res.json().catch(() => null) as { error?: string } | null
      if (!res.ok) {
        setError(data?.error ?? 'Cancellation failed')
        return
      }
      router.replace(destination)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
        <p>Posted supplier payments cannot be edited. Cancel this payment, then record a replacement if any details were wrong.</p>
      </div>

      <div className="bg-slate-50 rounded-lg p-4 space-y-1 text-sm">
        <p className="font-semibold text-slate-800">
          {payment.suppliers?.supplier_name}
          {payment.suppliers?.supplier_code && <span className="text-slate-400 font-mono text-xs"> ({payment.suppliers.supplier_code})</span>}
        </p>
        {payment.purchase_invoices && <p className="text-slate-500">Invoice: {payment.purchase_invoices.invoice_number}</p>}
        <p className="text-slate-500">Payment date: {formatDate(payment.payment_date)}</p>
        <p className="text-slate-500">Mode: <span className="capitalize">{payment.payment_mode.replace(/_/g, ' ')}</span></p>
        {payment.reference_number && <p className="text-slate-500">Reference: {payment.reference_number}</p>}
        <p className="text-slate-500">
          Amount: <span className="font-semibold text-red-600">{formatCurrency(payment.amount_paid)}</span>
          {payment.discount_amount ? <span className="ml-2 text-amber-600">· Discount: {formatCurrency(payment.discount_amount)}</span> : null}
        </p>
      </div>

      <div>
        <label htmlFor="cancellation-reason" className="block text-sm font-medium text-slate-700 mb-1.5">
          Cancellation reason
        </label>
        <textarea
          id="cancellation-reason"
          rows={3}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Explain why this payment is being cancelled"
          required
          className={inputClass}
        />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={loading || !reason.trim()}
          className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
          {loading ? 'Cancelling…' : 'Cancel Payment'}
        </button>
        <button
          type="button"
          onClick={() => router.replace(destination)}
          className="px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
        >
          Keep Payment
        </button>
      </div>
    </form>
  )
}
