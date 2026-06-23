'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, PauseCircle, RefreshCw, CalendarCheck } from 'lucide-react'

interface Props {
  contractId: string
  currentStatus: string
  visitsUsed: number
  visitsIncluded: number
}

export function AMCActions({ contractId, currentStatus, visitsUsed, visitsIncluded }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [localStatus, setLocalStatus] = useState(currentStatus)
  const [localVisits, setLocalVisits] = useState(visitsUsed)

  async function patch(payload: Record<string, unknown>) {
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/amc/${contractId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to update')
        return
      }
      if (data.contract?.status) setLocalStatus(data.contract.status)
      if (data.contract?.visits_used !== undefined) setLocalVisits(data.contract.visits_used)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function setStatus(status: string) {
    patch({ status })
  }

  function recordVisit() {
    if (visitsIncluded > 0 && localVisits >= visitsIncluded) {
      setError('All contracted visits have been used')
      return
    }
    patch({ visits_used: localVisits + 1 })
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">
          {error}
        </div>
      )}

      {/* Record Visit */}
      {visitsIncluded > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Visits</h3>
          <p className="text-2xl font-bold text-slate-900 mb-0.5">
            {localVisits} <span className="text-slate-400 text-base font-normal">/ {visitsIncluded}</span>
          </p>
          <p className="text-xs text-slate-500 mb-3">visits recorded</p>
          <button
            onClick={recordVisit}
            disabled={loading || localStatus !== 'active'}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <CalendarCheck className="w-4 h-4" />
            Record Visit
          </button>
        </div>
      )}

      {/* Status Actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Change Status</h3>
        <div className="space-y-2">
          {localStatus !== 'active' && (
            <button
              onClick={() => setStatus('active')}
              disabled={loading}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 text-green-700 text-sm font-semibold rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              Set Active
            </button>
          )}

          {localStatus === 'active' && (
            <button
              onClick={() => setStatus('suspended')}
              disabled={loading}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              <PauseCircle className="w-4 h-4" />
              Suspend
            </button>
          )}

          {(localStatus === 'active' || localStatus === 'suspended') && (
            <button
              onClick={() => setStatus('cancelled')}
              disabled={loading}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Cancel Contract
            </button>
          )}

          {(localStatus === 'expired' || localStatus === 'cancelled') && (
            <button
              onClick={() => setStatus('active')}
              disabled={loading}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 text-blue-700 text-sm font-semibold rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Renew
            </button>
          )}
        </div>

        {loading && (
          <p className="text-xs text-slate-400 text-center mt-2">Updating…</p>
        )}
      </div>
    </div>
  )
}
