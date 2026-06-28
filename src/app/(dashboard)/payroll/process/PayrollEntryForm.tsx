'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CalendarX } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface StaffRow {
  id: string
  staff_code: string
  full_name: string
  designation: string | null
  department: string | null
  basic_salary: number
  housing_allowance: number
  transport_allowance: number
  food_allowance: number | null
  other_allowance: number
  allowance_name: string | null
  fixed_overtime_monthly: number | null
  advance_balance: number | null
}

interface Props {
  month: number
  year: number
  staff: StaffRow[]
  absentDaysMap: Record<string, number>
}

interface EntryState {
  normal_overtime: string
  friday_overtime: string
  advance_deduction: string
  absent_days: string   // pre-filled from attendance, editable for correction
  food_deduction: string  // manual only — not auto-filled
}

const inputCls = 'w-24 text-right border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const inputSmCls = 'w-20 text-right border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

export function PayrollEntryForm({ month, year, staff, absentDaysMap }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [entries, setEntries] = useState<Record<string, EntryState>>(
    Object.fromEntries(staff.map((s) => [s.id, {
      normal_overtime: '',
      friday_overtime: '',
      advance_deduction: '',
      // Pre-fill absent days from attendance records
      absent_days: absentDaysMap[s.id] ? String(absentDaysMap[s.id]) : '',
      food_deduction: '',
    }]))
  )

  function setEntry(staffId: string, field: keyof EntryState, value: string) {
    setEntries((prev) => ({ ...prev, [staffId]: { ...prev[staffId], [field]: value } }))
  }

  function calcOT(basic: number, hrs: number, multiplier: number) {
    return (basic / 30 / 8) * multiplier * hrs
  }

  function calcAbsentDeduction(s: StaffRow, absentDays: number) {
    const allowance = (s.housing_allowance ?? 0) + (s.transport_allowance ?? 0) + (s.other_allowance ?? 0)
    const fixedOT = s.fixed_overtime_monthly ?? 0
    return ((s.basic_salary ?? 0) + allowance + fixedOT) / 30 * absentDays
  }

  async function handleProcess() {
    setLoading(true)
    setError('')
    try {
      const entriesArray = staff.map((s) => ({
        staff_id: s.id,
        normal_overtime: parseFloat(entries[s.id]?.normal_overtime || '0') || 0,
        friday_overtime: parseFloat(entries[s.id]?.friday_overtime || '0') || 0,
        advance_deduction: parseFloat(entries[s.id]?.advance_deduction || '0') || 0,
        absent_days: parseFloat(entries[s.id]?.absent_days || '0') || 0,
        food_deduction: parseFloat(entries[s.id]?.food_deduction || '0') || 0,
      }))
      const res = await fetch('/api/payroll/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year, entries: entriesArray }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to process payroll'); return }
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const hasAdvances = staff.some(s => (s.advance_balance ?? 0) > 0)
  const hasAnyAbsent = Object.values(absentDaysMap).some(d => d > 0)

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      {hasAnyAbsent && (
        <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
          <CalendarX className="w-4 h-4 flex-shrink-0" />
          <span>Absent days have been auto-filled from attendance records. Basic, Allowance and Fixed OT will be deducted proportionally. Food deduction is manual — enter if applicable.</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-900">Enter Payroll — {staff.length} Employees</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Absent days are pulled from attendance. Basic + Allowance + Fixed OT deducted automatically.
              Food deduction is manual. Enter Normal OT (×1.25), Friday OT (×1.5) hours{hasAdvances ? ', and Advance Recovery' : ''}.
            </p>
          </div>
          <button
            onClick={handleProcess}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60 transition-colors whitespace-nowrap flex-shrink-0"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : `Process ${staff.length} Payslips`}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1300px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Employee</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">Basic</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">Allowance</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">Food</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">Fixed OT</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">
                  Normal OT hrs <span className="text-blue-500">✎</span>
                </th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">
                  Friday OT hrs <span className="text-blue-500">✎</span>
                </th>
                <th className="text-right text-xs font-semibold text-red-400 uppercase tracking-wider px-3 py-3">
                  Absent Days <span className="text-blue-500">✎</span>
                </th>
                <th className="text-right text-xs font-semibold text-red-400 uppercase tracking-wider px-3 py-3">
                  Food Deduct <span className="text-blue-500">✎</span>
                </th>
                {hasAdvances && (
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">Adv. Bal.</th>
                )}
                {hasAdvances && (
                  <th className="text-right text-xs font-semibold text-red-400 uppercase tracking-wider px-3 py-3">
                    Adv. Deduct. <span className="text-blue-500">✎</span>
                  </th>
                )}
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {staff.map((s) => {
                const normalOTHrs = parseFloat(entries[s.id]?.normal_overtime || '0') || 0
                const fridayOTHrs = parseFloat(entries[s.id]?.friday_overtime || '0') || 0
                const advDeduct = parseFloat(entries[s.id]?.advance_deduction || '0') || 0
                const absentDays = parseFloat(entries[s.id]?.absent_days || '0') || 0
                const foodDeduct = parseFloat(entries[s.id]?.food_deduction || '0') || 0

                const allowance = (s.housing_allowance ?? 0) + (s.transport_allowance ?? 0) + (s.other_allowance ?? 0)
                const food = s.food_allowance ?? 0
                const fixedOT = s.fixed_overtime_monthly ?? 0
                const normalOT = calcOT(s.basic_salary ?? 0, normalOTHrs, 1.25)
                const fridayOT = calcOT(s.basic_salary ?? 0, fridayOTHrs, 1.5)
                const gross = (s.basic_salary ?? 0) + allowance + food + fixedOT + normalOT + fridayOT

                const absentDeduct = absentDays > 0 ? calcAbsentDeduction(s, absentDays) : 0
                const net = gross - advDeduct - absentDeduct - foodDeduct
                const advBalance = s.advance_balance ?? 0
                const allowanceName = s.allowance_name ?? 'Allowance'
                const fromAttendance = absentDays > 0 && (absentDaysMap[s.id] ?? 0) === absentDays

                return (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-sm font-semibold text-slate-800">{s.full_name}</p>
                      <p className="text-xs text-slate-500">{s.designation ?? s.department ?? s.staff_code}</p>
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-slate-700">{formatCurrency(s.basic_salary ?? 0)}</td>
                    <td className="px-3 py-3 text-right text-sm">
                      {allowance > 0 ? (
                        <div>
                          <span className="text-slate-600">{formatCurrency(allowance)}</span>
                          {allowanceName !== 'Allowance' && <p className="text-xs text-slate-400">{allowanceName}</p>}
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-slate-600">{food > 0 ? formatCurrency(food) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-3 text-right text-sm text-slate-600">{fixedOT > 0 ? formatCurrency(fixedOT) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-3 text-right">
                      <input type="number" min="0" step="0.5" placeholder="0"
                        value={entries[s.id]?.normal_overtime}
                        onChange={(e) => setEntry(s.id, 'normal_overtime', e.target.value)}
                        className={inputCls} />
                      {normalOTHrs > 0 && <p className="text-xs text-blue-600 mt-0.5">{formatCurrency(normalOT)}</p>}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <input type="number" min="0" step="0.5" placeholder="0"
                        value={entries[s.id]?.friday_overtime}
                        onChange={(e) => setEntry(s.id, 'friday_overtime', e.target.value)}
                        className={inputCls} />
                      {fridayOTHrs > 0 && <p className="text-xs text-blue-600 mt-0.5">{formatCurrency(fridayOT)}</p>}
                    </td>
                    {/* Absent Days — pre-filled from attendance, editable for correction */}
                    <td className="px-3 py-3 text-right">
                      <input type="number" min="0" max="31" step="0.5" placeholder="0"
                        value={entries[s.id]?.absent_days}
                        onChange={(e) => setEntry(s.id, 'absent_days', e.target.value)}
                        className={`${inputSmCls} ${absentDays > 0 ? 'border-red-300 bg-red-50 text-red-700' : ''}`} />
                      {absentDays > 0 && (
                        <p className="text-xs text-red-500 mt-0.5">
                          −{formatCurrency(absentDeduct)}
                          {fromAttendance && <span className="ml-1 text-slate-400">↑att</span>}
                        </p>
                      )}
                    </td>
                    {/* Food deduction — manual only, no auto-fill */}
                    <td className="px-3 py-3 text-right">
                      <input type="number" min="0" step="0.001" placeholder="0.000"
                        value={entries[s.id]?.food_deduction}
                        onChange={(e) => setEntry(s.id, 'food_deduction', e.target.value)}
                        className={`${inputSmCls} ${foodDeduct > 0 ? 'border-red-300 bg-red-50 text-red-700' : ''}`} />
                      {foodDeduct > 0 && <p className="text-xs text-red-500 mt-0.5">food</p>}
                    </td>
                    {hasAdvances && (
                      <td className="px-3 py-3 text-right text-sm">
                        {advBalance > 0
                          ? <span className="font-semibold text-amber-600">{formatCurrency(advBalance)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                    )}
                    {hasAdvances && (
                      <td className="px-3 py-3 text-right">
                        <input type="number" min="0" step="0.001" placeholder="0.000"
                          max={advBalance > 0 ? advBalance : undefined}
                          value={entries[s.id]?.advance_deduction}
                          onChange={(e) => setEntry(s.id, 'advance_deduction', e.target.value)}
                          className={`${inputCls} ${advDeduct > 0 ? 'border-red-300 text-red-700' : ''}`} />
                      </td>
                    )}
                    <td className="px-5 py-3 text-right">
                      <span className={`text-sm font-bold ${net < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                        {formatCurrency(net)}
                      </span>
                      {(absentDeduct > 0 || foodDeduct > 0) && (
                        <p className="text-xs text-red-400 mt-0.5">−{formatCurrency(absentDeduct + foodDeduct)} deducted</p>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
