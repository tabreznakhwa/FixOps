'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DollarSign, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

const PAYMENT_MODES = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
]

export interface PendingSlip {
  slipId: string
  staffName: string
  netSalary: number
  hasIban: boolean
}

export function PaySalariesButton({
  runId,
  pendingCount,
  totalNet,
  pendingSlips,
}: {
  runId: string
  pendingCount: number
  totalNet: number
  pendingSlips: PendingSlip[]
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' }))
  // Most staff here are actually paid by bank transfer regardless of
  // whether their profile happens to have an IBAN on file, so default
  // everyone to bank transfer — cash is the exception, not the rule.
  const [modes, setModes] = useState<Record<string, string>>(
    Object.fromEntries(pendingSlips.map(s => [s.slipId, 'bank_transfer']))
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  if (pendingCount === 0) return null

  function setMode(slipId: string, mode: string) {
    setModes(prev => ({ ...prev, [slipId]: mode }))
  }

  async function handlePay() {
    setLoading(true)
    setError('')
    try {
      const entries = pendingSlips.map(s => ({ slip_id: s.slipId, payment_mode: modes[s.slipId] ?? 'cash' }))
      const res = await fetch(`/api/payroll/${runId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_date: date, entries }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      setOpen(false)
      router.refresh()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  const fmtKWD = (n: number) => `KWD ${n.toLocaleString('en-KW', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`

  const cashTotal = pendingSlips.filter(s => modes[s.slipId] === 'cash').reduce((sum, s) => sum + s.netSalary, 0)
  const bankTotal = pendingSlips.filter(s => modes[s.slipId] !== 'cash').reduce((sum, s) => sum + s.netSalary, 0)

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors">
        <DollarSign className="w-4 h-4" />
        Pay {pendingCount} Salaries
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] bg-black/40 p-3 sm:p-6 overflow-y-auto">
          <div className="fixed inset-0" onClick={() => setOpen(false)} />
          <div className="relative mx-auto bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[calc(100vh-1.5rem)] sm:h-[calc(100vh-3rem)] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Mark Salaries as Paid</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {pendingCount} employees · Total {fmtKWD(totalNet)}
                  {pendingCount > 5 && <span className="text-blue-500"> · scroll the list below to see everyone ↓</span>}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Payment date */}
            <div className="px-5 pt-4 pb-3 border-b border-slate-100">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Payment Date
              </label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Per-employee mode list */}
            <div className="overflow-y-auto flex-1 min-h-0">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-2.5">Employee</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-2.5">Net</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-2.5">Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pendingSlips.map(s => (
                    <tr key={s.slipId} className="hover:bg-slate-50/50">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-slate-800 text-sm">{s.staffName}</p>
                        {s.hasIban && <p className="text-xs text-slate-400">Has IBAN</p>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{fmtKWD(s.netSalary)}</td>
                      <td className="px-5 py-2.5 text-right">
                        <select
                          value={modes[s.slipId] ?? 'cash'}
                          onChange={e => setMode(s.slipId, e.target.value)}
                          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {PAYMENT_MODES.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals summary */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-none">
              <div className="flex gap-4 text-xs">
                {cashTotal > 0 && (
                  <span className="text-slate-600">Cash: <strong className="text-slate-800">{fmtKWD(cashTotal)}</strong></span>
                )}
                {bankTotal > 0 && (
                  <span className="text-slate-600">Bank/Cheque: <strong className="text-slate-800">{fmtKWD(bankTotal)}</strong></span>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-100 flex gap-2 rounded-b-2xl">
              {error && <p className="text-xs text-red-600 self-center flex-1">{error}</p>}
              {!error && <div className="flex-1" />}
              <button onClick={() => setOpen(false)}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handlePay} disabled={loading}
                className="px-5 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
                {loading ? 'Processing…' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
