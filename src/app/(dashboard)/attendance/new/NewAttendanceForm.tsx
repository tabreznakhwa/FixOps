'use client'

import { useState } from 'react'
import { calcAttendanceBreakdown, DUTY_START, DUTY_END } from '@/lib/attendance'

interface StaffMember {
  id: string
  full_name: string
  designation: string | null
}

interface Props {
  staff: StaffMember[]
}

const OT_MULTIPLIER = 1.25 // Normal OT: 1 hr = 1.25 paid hrs (display only — calc lives in @/lib/attendance)

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

function fmtHrs(h: number): string {
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(2)}h`
}

export function NewAttendanceForm({ staff }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('present')
  const [checkIn, setCheckIn] = useState(DUTY_START)
  const [checkOut, setCheckOut] = useState(DUTY_END)

  const today = new Date().toISOString().split('T')[0]
  const showTimes = status === 'present' || status === 'half_day'
  const breakdown = showTimes ? calcAttendanceBreakdown(checkIn, checkOut) : null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const fd = new FormData(e.currentTarget)
    const body = {
      staff_id: fd.get('staff_id') as string,
      date: fd.get('date') as string,
      status,
      check_in: showTimes ? checkIn || null : null,
      check_out: showTimes ? checkOut || null : null,
      hours_worked: breakdown ? breakdown.hoursWorked : 0,
      overtime_hours: breakdown ? breakdown.normalOtPaidHrs : 0,
      notes: (fd.get('notes') as string) || null,
    }

    if (!body.staff_id) {
      setError('Please select a staff member')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to save attendance')
        setLoading(false)
        return
      }
      window.location.href = '/attendance'
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Attendance Record</h2>

        <div>
          <label className={labelClass}>Staff Member <span className="text-red-500">*</span></label>
          <select name="staff_id" required className={inputClass}>
            <option value="">Select staff member…</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}{s.designation ? ` — ${s.designation}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Date <span className="text-red-500">*</span></label>
          <input type="date" name="date" defaultValue={today} required className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Status <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'present', label: 'Present' },
              { value: 'absent', label: 'Absent' },
              { value: 'half_day', label: 'Half Day' },
              { value: 'leave', label: 'Leave' },
            ].map(({ value, label }) => (
              <label
                key={value}
                className={`flex items-center gap-2.5 cursor-pointer px-3 py-2.5 rounded-lg border transition-colors ${
                  status === value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="status"
                  value={value}
                  checked={status === value}
                  onChange={() => setStatus(value)}
                  className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <span className={`text-sm font-medium ${status === value ? 'text-blue-700' : 'text-slate-700'}`}>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {showTimes && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Check In</label>
                <input
                  type="time"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className={inputClass}
                />
                <p className="text-xs text-slate-400 mt-1">Duty starts 8:30 AM</p>
              </div>
              <div>
                <label className={labelClass}>Check Out</label>
                <input
                  type="time"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className={inputClass}
                />
                <p className="text-xs text-slate-400 mt-1">Duty ends 5:30 PM</p>
              </div>
            </div>

            {/* Live breakdown */}
            {breakdown && checkIn && checkOut && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-200 text-sm overflow-hidden">
                {/* Regular hours */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-semibold text-slate-800">Regular Hours</p>
                    {breakdown.lunchDeducted && (
                      <p className="text-xs text-slate-400 mt-0.5">Lunch break (1:00–2:00 PM) deducted</p>
                    )}
                  </div>
                  <p className="font-bold text-slate-900 text-base">{fmtHrs(breakdown.hoursWorked)}</p>
                </div>

                {/* Fixed OT */}
                <div className={`px-4 py-3 ${breakdown.fixedOtHrs > 0 ? 'bg-blue-50' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-slate-800">Fixed Overtime</p>
                      <p className="text-xs text-slate-400 mt-0.5">5:30 PM – 8:00 PM period</p>
                    </div>
                    <p className="font-semibold text-slate-600 text-sm">
                      {breakdown.fixedOtHrs > 0 ? `${fmtHrs(breakdown.fixedOtHrs)} eligible` : '—'}
                    </p>
                  </div>
                  <p className="text-xs text-blue-600 mt-1">Monthly fixed OT amount is set in the staff profile (HR settings)</p>
                </div>

                {/* Normal OT (after 8 PM) */}
                {breakdown.normalOtActualHrs > 0 ? (
                  <div className="flex items-center justify-between px-4 py-3 bg-amber-50">
                    <div>
                      <p className="font-semibold text-amber-800">Normal Overtime (after 8 PM)</p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        {fmtHrs(breakdown.normalOtActualHrs)} actual × {OT_MULTIPLIER} = {fmtHrs(breakdown.normalOtPaidHrs)} paid
                      </p>
                    </div>
                    <p className="font-bold text-amber-700 text-base">{fmtHrs(breakdown.normalOtPaidHrs)}</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="font-semibold text-slate-600">Normal Overtime (after 8 PM)</p>
                      <p className="text-xs text-slate-400 mt-0.5">1 hr worked = 1.25 hrs paid</p>
                    </div>
                    <p className="text-slate-400 text-sm">—</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div>
          <label className={labelClass}>Notes</label>
          <textarea name="notes" rows={2} placeholder="Optional notes…" className={`${inputClass} resize-none`} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Saving…' : 'Save Attendance'}
        </button>
        <a href="/attendance" className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-900 transition-colors">
          Cancel
        </a>
      </div>
    </form>
  )
}
