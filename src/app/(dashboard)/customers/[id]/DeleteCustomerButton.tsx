'use client'

import { useState, useTransition } from 'react'
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { deleteCustomer } from '../actions'

/**
 * Deleting a customer requires a typed reason, which is written to the audit
 * log. Linked complaints must be opted into explicitly — everything financial
 * (invoices, payments, quotations, work orders) blocks the delete server-side.
 */
export function DeleteCustomerButton({
  customerId,
  customerName,
  complaintCount = 0,
}: {
  customerId: string
  customerName: string
  complaintCount?: number
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [alsoComplaints, setAlsoComplaints] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const reasonOk = reason.trim().length >= 5
  const complaintsOk = complaintCount === 0 || alsoComplaints
  const canDelete = reasonOk && complaintsOk

  function handleDelete() {
    setError('')
    startTransition(async () => {
      const result = await deleteCustomer(customerId, reason, { deleteComplaints: alsoComplaints })
      // Success redirects, so reaching here means it was refused.
      if (result?.error) setError(result.error)
    })
  }

  function reset() {
    setOpen(false)
    setReason('')
    setAlsoComplaints(false)
    setError('')
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 transition-colors"
      >
        <Trash2 className="w-4 h-4" /> Delete
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={isPending ? undefined : reset} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Delete this customer?</h3>
            <p className="text-sm text-slate-600 mt-0.5">{customerName}</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Reason <span className="text-red-500">*</span>
          </label>
          <input
            autoFocus
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Duplicate entry created by mistake"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <p className="text-xs text-slate-400 mt-1">
            Recorded in the audit trail against your name. Minimum 5 characters.
          </p>
        </div>

        {complaintCount > 0 && (
          <label className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={alsoComplaints}
              onChange={e => setAlsoComplaints(e.target.checked)}
              className="mt-0.5 accent-red-600"
            />
            <span className="text-xs text-amber-900">
              Also delete this customer&apos;s <strong>{complaintCount} complaint
              {complaintCount === 1 ? '' : 's'}</strong>. This cannot be undone.
            </span>
          </label>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleDelete}
            disabled={!canDelete || isPending}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete permanently
          </button>
          <button
            onClick={reset}
            disabled={isPending}
            className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
