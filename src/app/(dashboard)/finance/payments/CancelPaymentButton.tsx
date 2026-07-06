'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { XCircle, Loader2 } from 'lucide-react'

interface Props {
  id: string
  paymentNumber: string
}

export function CancelPaymentButton({ id, paymentNumber }: Props) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCancel() {
    if (!reason.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/payments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_cancelled: true, cancelled_reason: reason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Cancel failed'); setLoading(false); return }
      router.refresh()
      setShowDialog(false)
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  if (!showDialog) {
    return (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDialog(true) }}
        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        title="Cancel payment"
      >
        <XCircle className="w-3.5 h-3.5" />
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => { if (!loading) { setShowDialog(false); setReason(''); setError('') } }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <XCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">Cancel Payment?</p>
            <p className="text-xs text-slate-500 mt-0.5">{paymentNumber} — this will reverse the invoice balance.</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Reason <span className="text-red-500">*</span></label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Enter reason for cancellation…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            disabled={loading || !reason.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Cancel Payment
          </button>
          <button
            onClick={() => { setShowDialog(false); setReason(''); setError('') }}
            disabled={loading}
            className="px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  )
}
