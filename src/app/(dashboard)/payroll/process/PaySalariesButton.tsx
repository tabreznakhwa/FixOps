'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { DollarSign, X } from 'lucide-react'

const PAYMENT_MODES = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
]

export function PaySalariesButton({ runId, pendingCount, totalNet }: {
  runId: string; pendingCount: number; totalNet: number
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('bank_transfer')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (pendingCount === 0) return null

  async function handlePay() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/payroll/${runId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_mode: mode, payment_date: date }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      setOpen(false)
      router.refresh()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  const fmtKWD = (n: number) => `KWD ${n.toLocaleString('en-KW', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors">
        <DollarSign className="w-4 h-4" />
        Pay {pendingCount} Salaries
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl p-5 z-40">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-slate-900">Mark Salaries as Paid</h4>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              This will mark <strong>{pendingCount} employees</strong> as paid.
              Total: <strong className="text-green-700">{fmtKWD(totalNet)}</strong>
            </p>
            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Payment Mode</label>
                <select value={mode} onChange={e => setMode(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Payment Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handlePay} disabled={loading}
                  className="flex-1 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {loading ? 'Processing…' : 'Confirm Payment'}
                </button>
                <button onClick={() => setOpen(false)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
