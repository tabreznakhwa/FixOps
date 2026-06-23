'use client'

import { useState } from 'react'
import { CheckCircle, CreditCard, XCircle, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface Props {
  invoiceId: string
  currentStatus: string
  balanceDue: number
  customerId: string
}

export function InvoiceActions({ invoiceId, currentStatus, balanceDue, customerId }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const patch = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/invoices/${invoiceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Update failed')
    return data
  }

  const handleIssue = async () => {
    setError('')
    setLoading('issue')
    try {
      await patch({ status: 'issued' })
      window.location.reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to issue invoice')
      setLoading(null)
    }
  }

  const handleCancel = async () => {
    if (!cancelReason.trim()) return
    setError('')
    setLoading('cancel')
    try {
      await patch({ status: 'cancelled', cancelled_reason: cancelReason.trim() })
      window.location.reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to cancel invoice')
      setLoading(null)
    }
  }

  const canIssue = currentStatus === 'draft'
  const canRecordPayment = ['issued', 'partial', 'overdue'].includes(currentStatus)
  const canCancel = !['cancelled', 'paid', 'written_off'].includes(currentStatus)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <h3 className="font-semibold text-slate-900 mb-1">Actions</h3>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {canIssue && (
        <button
          onClick={handleIssue}
          disabled={loading === 'issue'}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading === 'issue' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4" />
          )}
          Issue Invoice
        </button>
      )}

      {canRecordPayment && (
        <Link
          href={`/finance/payments/new?invoice_id=${invoiceId}&customer_id=${customerId}`}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition"
        >
          <CreditCard className="w-4 h-4" />
          Record Payment
          {balanceDue > 0 && (
            <span className="text-xs bg-green-700 px-1.5 py-0.5 rounded font-mono">
              AED {balanceDue.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
          )}
        </Link>
      )}

      {canCancel && !showCancelDialog && (
        <button
          onClick={() => setShowCancelDialog(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 text-red-500 text-sm font-semibold rounded-lg hover:bg-red-50 transition"
        >
          <XCircle className="w-4 h-4" />
          Cancel Invoice
        </button>
      )}

      {showCancelDialog && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-red-700">Cancel this invoice?</p>
          <textarea
            className="w-full border border-red-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
            rows={3}
            placeholder="Reason for cancellation (required)…"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              disabled={!cancelReason.trim() || loading === 'cancel'}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === 'cancel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Confirm Cancel
            </button>
            <button
              onClick={() => { setShowCancelDialog(false); setCancelReason('') }}
              disabled={loading === 'cancel'}
              className="px-3 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-white transition"
            >
              Back
            </button>
          </div>
        </div>
      )}

      <Link
        href="/finance/invoices"
        className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Invoices
      </Link>
    </div>
  )
}
