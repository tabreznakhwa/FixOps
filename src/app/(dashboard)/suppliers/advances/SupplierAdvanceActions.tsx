'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, X } from 'lucide-react'

interface Props {
  advanceId: string
  advanceNumber: string
  canCancel: boolean
}

export function SupplierAdvanceActions({
  advanceId,
  advanceNumber,
  canCancel,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function cancelAdvance(event: React.FormEvent) {
    event.preventDefault()
    const cancellationReason = reason.trim()
    if (!cancellationReason) {
      setError('Cancellation reason is required')
      return
    }

    setError('')
    setLoading(true)
    try {
      const response = await fetch(`/api/supplier-advances/${advanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          reason: cancellationReason,
        }),
      })
      const payload = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) {
        setError(payload?.error ?? 'Failed to cancel supplier advance')
        return
      }

      setOpen(false)
      setReason('')
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!canCancel) return null

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError('')
          setOpen(true)
        }}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
      >
        <X className="h-3.5 w-3.5" /> Cancel
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !loading) setOpen(false)
          }}
        >
          <form
            onSubmit={cancelAdvance}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`cancel-advance-${advanceId}`}
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
          >
            <h2 id={`cancel-advance-${advanceId}`} className="text-lg font-bold text-slate-900">
              Cancel supplier advance
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {advanceNumber} will remain in the audit trail with an equal-and-opposite accounting reversal.
            </p>

            {error && (
              <p className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </p>
            )}

            <div className="mt-5">
              <label htmlFor={`cancel-reason-${advanceId}`} className="mb-1.5 block text-sm font-medium text-slate-700">
                Cancellation reason
              </label>
              <textarea
                id={`cancel-reason-${advanceId}`}
                autoFocus
                rows={3}
                maxLength={1000}
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain why this advance is being cancelled"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={loading}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Keep Advance
              </button>
              <button
                type="submit"
                disabled={loading || !reason.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Cancel Advance
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
