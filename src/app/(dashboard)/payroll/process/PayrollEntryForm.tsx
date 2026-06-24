'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
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
  fixed_overtime_monthly: number | null
}

interface Props {
  month: number
  year: number
  staff: StaffRow[]
}

export function PayrollEntryForm({ month, year, staff }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [entries, setEntries] = useState<Record<string, { normal_overtime: string; friday_overtime: string }>>(
    Object.fromEntries(staff.map((s) => [s.id, { normal_overtime: '', friday_overtime: '' }]))
  )

  function setEntry(staffId: string, field: 'normal_overtime' | 'friday_overtime', value: string) {
    setEntries((prev) => ({ ...prev, [staffId]: { ...prev[staffId], [field]: value } }))
  }

  async function handleProcess() {
    setLoading(true)
    setError('')
    try {
      const entriesArray = staff.map((s) => ({
        staff_id: s.id,
        normal_overtime: parseFloat(entries[s.id]?.normal_overtime || '0') || 0,
        friday_overtime: parseFloat(entries[s.id]?.friday_overtime || '0') || 0,
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

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-900">Enter Overtime — {staff.length} Employees</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Basic, Allowances, Food Allowance and Fixed OT are pre-filled from staff profiles.
              Enter Normal OT and Friday OT amounts for this month, then process.
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
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Employee</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Basic</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Allowance</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Food Allow.</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Fixed OT</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">
                  Normal OT <span className="text-blue-500">✎</span>
                </th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">
                  Friday OT <span className="text-blue-500">✎</span>
                </th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {staff.map((s) => {
                const normalOT = parseFloat(entries[s.id]?.normal_overtime || '0') || 0
                const fridayOT = parseFloat(entries[s.id]?.friday_overtime || '0') || 0
                const allowance = (s.housing_allowance ?? 0) + (s.transport_allowance ?? 0) + (s.other_allowance ?? 0)
                const food = s.food_allowance ?? 0
                const fixedOT = s.fixed_overtime_monthly ?? 0
                const total = (s.basic_salary ?? 0) + allowance + food + fixedOT + normalOT + fridayOT

                return (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-sm font-semibold text-slate-800">{s.full_name}</p>
                      <p className="text-xs text-slate-500">{s.designation ?? s.department ?? s.staff_code}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">{formatCurrency(s.basic_salary ?? 0)}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">{allowance > 0 ? formatCurrency(allowance) : '—'}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">{food > 0 ? formatCurrency(food) : '—'}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">{fixedOT > 0 ? formatCurrency(fixedOT) : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        placeholder="0.000"
                        value={entries[s.id]?.normal_overtime}
                        onChange={(e) => setEntry(s.id, 'normal_overtime', e.target.value)}
                        className="w-28 text-right border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        placeholder="0.000"
                        value={entries[s.id]?.friday_overtime}
                        onChange={(e) => setEntry(s.id, 'friday_overtime', e.target.value)}
                        className="w-28 text-right border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-slate-900">{formatCurrency(total)}</td>
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
