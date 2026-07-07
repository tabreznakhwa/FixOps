'use client'

import { useState, useTransition } from 'react'
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { deleteCustomer } from '../actions'

export function DeleteCustomerButton({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    setError('')
    startTransition(async () => {
      const result = await deleteCustomer(customerId)
      if (result?.error) {
        setError(result.error)
        setShowConfirm(false)
      }
    })
  }

  if (showConfirm) {
    return (
      <div className="flex items-center gap-2">
        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
        <span className="text-xs text-slate-500">Delete &ldquo;{customerName}&rdquo;?</span>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
        >
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Yes, delete
        </button>
        <button
          onClick={() => { setShowConfirm(false); setError('') }}
          className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      <button
        onClick={() => setShowConfirm(true)}
        className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 transition-colors"
      >
        <Trash2 className="w-4 h-4" /> Delete
      </button>
    </div>
  )
}
