'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CalendarX, Info } from 'lucide-react'
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
  absentDaysMap: Record<string, number>       // from attendance: absent=1, half=0.5
  normalOtPaidHoursMap: Record<string, number> // sum of attendance.overtime_hours (already ×1.25)
}

interface EntryState {
  food_deduction: string
  advance_deduction: string
}

export function PayrollEntryForm({ month, year, staff, absentDaysMap, normalOtPaidHoursMap }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [entries, setEntries] = useState<Record<string, EntryState>>(
    Object.fromEntries(staff.map((s) => [s.id, {
      food_deduction: '',
      advance_deduction: '',
    }]))
  )

  function setEntry(staffId: string, field: keyof EntryState, value: string) {
    setEntries((prev) => ({ ...prev, [staffId]: { ...prev[staffId], [field]: value } }))
  }

  // Normal OT: hourlyRate × normalOtPaidHours (no ×1.25 — attendance already applied it)
  function calcNormalOT(basic: number, paidHours: number) {
    return (basic / 30 / 8) * paidHours
  }

  function calcAbsentDeduction(s: StaffRow, absentDays: number) {
    const allowance = (s.housing_allowance ?? 0) + (s.transport_allowance ?? 0) + (s.other_allowance ?? 0)
    const fixedOT = s.fixed_overtime_monthly ?? 0
    return absentDays > 0 ? ((s.basic_salary ?? 0) + allowance + fixedOT) / 30 * absentDays : 0
  }

  async function handleProcess() {
    setLoading(true)
    setError('')
    try {
      const entriesArray = staff.map((s) => ({
        staff_id: s.id,
        normal_ot_paid_hours: normalOtPaidHoursMap[s.id] ?? 0,
        absent_days: absentDaysMap[s.id] ?? 0,
        food_deduction: parseFloat(entries[s.id]?.food_deduction || '0') || 0,
        advance_deduction: parseFloat(entries[s.id]?.advance_deduction || '0') || 0,
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
  const hasAnyOT = Object.values(normalOtPaidHoursMap).some(h => h > 0)

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      <div className="flex gap-3 flex-wrap">
        {hasAnyAbsent && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-2.5">
            <CalendarX className="w-4 h-4 flex-shrink-0" />
            <span>Absent days detected from attendance. Basic + Allowance + Fixed OT deducted proportionally.</span>
          </div>
        )}
        {!hasAnyAbsent && !hasAnyOT && (
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 text-slate-600 text-sm rounded-xl px-4 py-2.5">
            <Info className="w-4 h-4 flex-shrink-0" />
            <span>No attendance records found for this month — full salary will be paid. Mark attendance first to apply OT and deductions.</span>
          </div>
        )}
        {hasAnyOT && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-xl px-4 py-2.5">
            <Info className="w-4 h-4 flex-shrink-0" />
            <span>Normal OT auto-calculated from attendance (formula: Basic ÷ 30 ÷ 8 × OT paid hours). Fixed OT from staff profile.</span>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-900">Review Payroll — {staff.length} Employees</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              All values are auto-calculated from attendance. Only Food Deduction{hasAdvances ? ' and Advance Recovery' : ''} require manual entry.
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
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Employee</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">Basic</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">Allowance</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">Food</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">Fixed OT</th>
                <th className="text-right text-xs font-semibold text-blue-500 uppercase tracking-wider px-3 py-3">Normal OT</th>
                <th className="text-right text-xs font-semibold text-red-400 uppercase tracking-wider px-3 py-3">Absent</th>
                <th className="text-right text-xs font-semibold text-red-400 uppercase tracking-wider px-3 py-3">Absent Deduct</th>
                <th className="text-right text-xs font-semibold text-red-400 uppercase tracking-wider px-3 py-3">
                  Food Deduct <span className="text-blue-500 normal-case">✎</span>
                </th>
                {hasAdvances && (
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 py-3">Adv. Bal.</th>
                )}
                {hasAdvances && (
                  <th className="text-right text-xs font-semibold text-red-400 uppercase tracking-wider px-3 py-3">
                    Adv. Deduct <span className="text-blue-500 normal-case">✎</span>
                  </th>
                )}
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {staff.map((s) => {
                const allowance = (s.housing_allowance ?? 0) + (s.transport_allowance ?? 0) + (s.other_allowance ?? 0)
                const food = s.food_allowance ?? 0
                const fixedOT = s.fixed_overtime_monthly ?? 0

                const normalOtPaidHours = normalOtPaidHoursMap[s.id] ?? 0
                const normalOT = calcNormalOT(s.basic_salary ?? 0, normalOtPaidHours)

                const absentDays = absentDaysMap[s.id] ?? 0
                const absentDeduct = calcAbsentDeduction(s, absentDays)

                const foodDeduct = parseFloat(entries[s.id]?.food_deduction || '0') || 0
                const advDeduct = parseFloat(entries[s.id]?.advance_deduction || '0') || 0
                const advBalance = s.advance_balance ?? 0

                const gross = (s.basic_salary ?? 0) + allowance + food + fixedOT + normalOT
                const net = gross - absentDeduct - foodDeduct - advDeduct
                const allowanceName = s.allowance_name ?? 'Allowance'

                return (
                  <tr key={s.id} className={`hover:bg-slate-50/50 transition-colors ${absentDays > 0 ? 'bg-red-50/20' : ''}`}>
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
                    <td className="px-3 py-3 text-right text-sm text-slate-600">
                      {food > 0 ? formatCurrency(food) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-slate-600">
                      {fixedOT > 0 ? formatCurrency(fixedOT) : <span className="text-slate-300">—</span>}
                    </td>
                    {/* Normal OT — auto from attendance */}
                    <td className="px-3 py-3 text-right">
                      {normalOT > 0 ? (
                        <div>
                          <span className="text-sm font-semibold text-blue-700">{formatCurrency(normalOT)}</span>
                          <p className="text-xs text-slate-400">{normalOtPaidHours.toFixed(2)}h paid</p>
                        </div>
                      ) : <span className="text-sm text-slate-300">—</span>}
                    </td>
                    {/* Absent days — read-only from attendance */}
                    <td className="px-3 py-3 text-right">
                      {absentDays > 0 ? (
                        <span className="text-sm font-semibold text-red-600">
                          {absentDays % 1 === 0 ? absentDays : absentDays.toFixed(1)} {absentDays === 0.5 ? 'half' : 'd'}
                        </span>
                      ) : <span className="text-sm text-slate-300">—</span>}
                    </td>
                    {/* Absent deduction — auto-calculated */}
                    <td className="px-3 py-3 text-right">
                      {absentDeduct > 0 ? (
                        <span className="text-sm font-semibold text-red-600">−{formatCurrency(absentDeduct)}</span>
                      ) : <span className="text-sm text-slate-300">—</span>}
                    </td>
                    {/* Food deduction — ONLY editable input for attendance-related deductions */}
                    <td className="px-3 py-3 text-right">
                      <input
                        type="number" min="0" step="0.001" placeholder="0.000"
                        value={entries[s.id]?.food_deduction}
                        onChange={(e) => setEntry(s.id, 'food_deduction', e.target.value)}
                        className={`w-24 text-right border rounded-lg px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          foodDeduct > 0 ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-white'
                        }`}
                      />
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
                        <input
                          type="number" min="0" step="0.001" placeholder="0.000"
                          max={advBalance > 0 ? advBalance : undefined}
                          value={entries[s.id]?.advance_deduction}
                          onChange={(e) => setEntry(s.id, 'advance_deduction', e.target.value)}
                          className={`w-24 text-right border rounded-lg px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            advDeduct > 0 ? 'border-red-300 text-red-700 bg-red-50' : 'border-slate-200 bg-white'
                          }`}
                        />
                      </td>
                    )}
                    <td className="px-5 py-3 text-right">
                      <span className={`text-sm font-bold ${net < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                        {formatCurrency(Math.max(0, net))}
                      </span>
                      {(absentDeduct + foodDeduct) > 0 && (
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
