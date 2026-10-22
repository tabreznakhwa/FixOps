'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertTriangle, CheckCircle2, Calculator } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface StaffRow {
  id: string
  full_name: string
  designation: string | null
  basic_salary: number
  advance_balance: number | null
}

interface Result {
  staffName: string
  daysCovered: number
  basicEarned: number
  allowanceEarned: number
  foodEarned: number
  fixedOtEarned: number
  normalOvertime: number
  fridayOvertime: number
  absentDays: number
  absentDeduction: number
  annualLeaveDays: number
  annualLeaveDeduction: number
  grossEarned: number
  earnedBeforeRecovery: number
  outstandingAdvance: number
  advanceRecovery: number
  advanceRecoveryOverridden: boolean
  unrecoveredAdvance: number
  netPayable: number
  unworkedDays: number
  warnings: string[]
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
]

export function LeaveSettlementForm({
  staff,
  canEditAdvanceRecovery,
}: {
  staff: StaffRow[]
  canEditAdvanceRecovery: boolean
}) {
  const router = useRouter()

  const [staffId, setStaffId] = useState('')
  const [settlementDate, setSettlementDate] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notes, setNotes] = useState('')

  const [preview, setPreview] = useState<Result | null>(null)
  const [done, setDone] = useState<Result | null>(null)
  const [advanceRecovery, setAdvanceRecovery] = useState('')
  const [recoveryOverridden, setRecoveryOverridden] = useState(false)
  const [previewStale, setPreviewStale] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selected = staff.find(s => s.id === staffId) ?? null

  function resetPreview() {
    setPreview(null)
    setAdvanceRecovery('')
    setRecoveryOverridden(false)
    setPreviewStale(false)
    setError('')
  }

  async function call(isPreview: boolean) {
    if (!staffId) { setError('Select an employee'); return }
    if (!settlementDate) { setError('Choose the last day to pay up to'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/payroll/leave-settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: staffId,
          settlement_date: settlementDate,
          preview: isPreview,
          payment_method: paymentMethod,
          notes,
          ...(canEditAdvanceRecovery && recoveryOverridden
            ? { advance_recovery_amount: advanceRecovery }
            : {}),
          ...(!isPreview && preview
            ? {
                expected_advance_balance: preview.outstandingAdvance,
                expected_net_payable: preview.netPayable,
              }
            : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      if (isPreview) {
        setPreview(data)
        setAdvanceRecovery(Number(data.advanceRecovery).toFixed(3))
        setRecoveryOverridden(Boolean(data.advanceRecoveryOverridden))
        setPreviewStale(false)
      } else {
        setDone(data)
        resetPreview()
        router.refresh()
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-2xl">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">
              {formatCurrency(done.netPayable)} settled to {done.staffName}
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Covering {done.daysCovered} days. Recorded as a salary advance — the
              month-end payroll run will recover the resulting advance balance
              automatically, so no further action is needed.
            </p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setDone(null)
                  setStaffId('')
                  setSettlementDate('')
                  setNotes('')
                  resetPreview()
                }}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition"
              >
                Settle another employee
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const row = (label: string, value: number, opts: { negative?: boolean; muted?: boolean } = {}) => (
    <div className="flex justify-between py-1.5 text-sm">
      <span className={opts.muted ? 'text-slate-500' : 'text-slate-600'}>{label}</span>
      <span className={`font-medium ${opts.negative ? 'text-red-600' : 'text-slate-800'}`}>
        {opts.negative ? '−' : ''}{formatCurrency(Math.abs(value))}
      </span>
    </div>
  )

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Employee *</label>
          <select
            value={staffId}
            onChange={e => { setStaffId(e.target.value); resetPreview() }}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select employee…</option>
            {staff.map(s => (
              <option key={s.id} value={s.id}>
                {s.full_name}{s.designation ? ` — ${s.designation}` : ''}
              </option>
            ))}
          </select>
          {selected && (selected.advance_balance ?? 0) > 0 && (
            <p className="text-xs text-amber-700 mt-1.5">
              Existing advance balance {formatCurrency(selected.advance_balance ?? 0)} — it is netted off
              by default{canEditAdvanceRecovery ? ', and you can change the recovered amount after calculating.' : '.'}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Pay up to and including *</label>
          <input
            type="date"
            value={settlementDate}
            onChange={e => { setSettlementDate(e.target.value); resetPreview() }}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-500 mt-1.5">
            The last day being paid for — normally the day the employee leaves. No
            attendance needs to be marked in advance; the days are calculated for you.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Paid by</label>
          <select
            value={paymentMethod}
            onChange={e => setPaymentMethod(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Annual leave — travelling 20 Aug"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button
          onClick={() => call(true)}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg disabled:opacity-60 transition"
        >
          {loading && !preview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
          Calculate
        </button>
      </div>

      {preview && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">
              {preview.staffName} — {preview.daysCovered} days to {settlementDate}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Nothing has been paid yet. Review, then confirm.
            </p>
          </div>

          <div className="p-5">
            <div className="divide-y divide-slate-50">
              {row(`Basic (${preview.daysCovered}/30)`, preview.basicEarned)}
              {preview.allowanceEarned > 0 && row('Allowances', preview.allowanceEarned)}
              {preview.foodEarned > 0 && row('Food allowance', preview.foodEarned)}
              {preview.fixedOtEarned > 0 && row('Fixed overtime', preview.fixedOtEarned)}
              {preview.normalOvertime > 0 && row('Overtime earned', preview.normalOvertime)}
              {preview.fridayOvertime > 0 && row('Friday / holiday OT', preview.fridayOvertime)}
              {preview.absentDeduction > 0 && row(`Absence (${preview.absentDays} days)`, preview.absentDeduction, { negative: true })}
              {preview.annualLeaveDeduction > 0 && row(`Unpaid annual leave (${preview.annualLeaveDays} days)`, preview.annualLeaveDeduction, { negative: true })}
              {canEditAdvanceRecovery ? (
                <div className="py-3">
                  <div className="flex items-center justify-between gap-4">
                    <label htmlFor="advance-recovery" className="text-sm text-slate-600">
                      Existing advance recovered
                    </label>
                    <div className="relative w-40">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">KWD</span>
                      <input
                        id="advance-recovery"
                        type="number"
                        min="0"
                        max={preview.outstandingAdvance}
                        step="0.001"
                        inputMode="decimal"
                        value={advanceRecovery}
                        onChange={e => {
                          setAdvanceRecovery(e.target.value)
                          setRecoveryOverridden(true)
                          setPreviewStale(true)
                          setError('')
                        }}
                        className="w-full pl-12 pr-3 py-2 text-right rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 text-right">
                    Balance {formatCurrency(preview.outstandingAdvance)} · maximum payable recovery{' '}
                    {formatCurrency(Math.min(preview.outstandingAdvance, Math.max(0, preview.earnedBeforeRecovery)))}
                  </p>
                </div>
              ) : (
                row('Existing advance recovered', preview.advanceRecovery, { negative: true })
              )}
              {preview.unrecoveredAdvance > 0 && (
                <div className="py-2 text-right">
                  <p className="text-sm text-slate-600">
                    Advance carried to month-end: {formatCurrency(preview.unrecoveredAdvance)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    This remains in the resulting advance balance for month-end payroll to recover.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-4 mt-3 border-t border-slate-200">
              <span className="font-semibold text-slate-900">Payable now</span>
              <span className="text-xl font-bold text-green-700">{formatCurrency(preview.netPayable)}</span>
            </div>

            {preview.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mt-4 space-y-1">
                {preview.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </p>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              {previewStale ? (
                <button
                  onClick={() => call(true)}
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60 transition"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                  Recalculate
                </button>
              ) : (
                <button
                  onClick={() => call(false)}
                  disabled={loading || preview.netPayable <= 0}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60 transition"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Confirm &amp; Pay {formatCurrency(preview.netPayable)}
                </button>
              )}
              <button
                onClick={resetPreview}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
