'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UserX } from 'lucide-react'

/**
 * Closes a day by writing 'absent' rows for staff who have no record.
 * The nightly cron does this automatically; this is for closing a day now,
 * or for a day the cron missed.
 */
export function MarkAbsentButton({ date, count }: { date: string; count: number }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  async function mark() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/attendance/auto-absent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      if (data.skippedReason) { setError(data.skippedReason); return }
      setConfirming(false)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (confirming) {
    return (
      <div className="mt-3">
        <p className="text-xs text-amber-900 mb-2">
          This deducts a day&apos;s pay from {count} {count === 1 ? 'employee' : 'employees'} at
          month end. Anyone on approved leave should be marked as Leave instead.
        </p>
        <div className="flex gap-2">
          <button
            onClick={mark}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg disabled:opacity-60 transition"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
            Yes, mark absent
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="px-3 py-1.5 border border-amber-300 text-amber-900 text-xs font-semibold rounded-lg hover:bg-amber-100 transition"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-red-700 mt-2">{error}</p>}
      </div>
    )
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 text-amber-900 text-xs font-semibold rounded-lg hover:bg-amber-100 transition"
      >
        <UserX className="w-3.5 h-3.5" />
        Mark {count === 1 ? 'as' : 'all'} absent
      </button>
      {error && <p className="text-xs text-red-700 mt-2">{error}</p>}
    </div>
  )
}
