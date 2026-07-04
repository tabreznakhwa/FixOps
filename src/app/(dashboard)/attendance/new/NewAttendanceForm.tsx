'use client'

import { useState } from 'react'
import { calcAttendanceBreakdown, isFriday, DUTY_START, DUTY_END } from '@/lib/attendance'

interface StaffMember {
  id: string
  full_name: string
  designation: string | null
  friday_ot_amount: number
}

interface Props {
  staff: StaffMember[]
  lockedStaffId?: string | null
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

function fmtHrs(h: number): string {
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(2)}h`
}

export function NewAttendanceForm({ staff, lockedStaffId }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('present')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [checkIn, setCheckIn] = useState(DUTY_START)
  const [checkOut, setCheckOut] = useState(DUTY_END)
  const [isPublicHoliday, setIsPublicHoliday] = useState(false)

  // Controlled staff selection — needed to look up per-employee Friday OT amount
  const [staffId, setStaffId] = useState(lockedStaffId ?? '')
  const [fridayOtAmount, setFridayOtAmount] = useState(
    String(staff.find((s) => s.id === lockedStaffId)?.friday_ot_amount ?? 0)
  )

  function handleStaffChange(newId: string) {
    setStaffId(newId)
    const s = staff.find((m) => m.id === newId)
    setFridayOtAmount(String(s?.friday_ot_amount ?? 0))
  }

  function handlePublicHolidayToggle(checked: boolean) {
    setIsPublicHoliday(checked)
    // Pre-fill OT amount from staff profile when holiday is turned on
    if (checked && staffId) {
      const s = staff.find((m) => m.id === staffId)
      setFridayOtAmount(String(s?.friday_ot_amount ?? 0))
    }
  }

  function handleDateChange(newDate: string) {
    setDate(newDate)
    // Pre-fill OT amount when changing to a Friday
    if (isFriday(newDate) && staffId) {
      const s = staff.find((m) => m.id === staffId)
      setFridayOtAmount(String(s?.friday_ot_amount ?? 0))
    }
  }

  const isFridayDate = isFriday(date)
  const isFridayOrHoliday = isFridayDate || isPublicHoliday

  const showTimes = status === 'present' || status === 'half_day'
  const breakdown = showTimes ? calcAttendanceBreakdown(checkIn, checkOut, isFridayOrHoliday) : null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const fd = new FormData(e.currentTarget)
    const body = {
      staff_id: staffId,
      date,
      status,
      check_in: showTimes ? checkIn || null : null,
      check_out: showTimes ? checkOut || null : null,
      hours_worked: breakdown ? breakdown.hoursWorked : 0,
      overtime_hours: breakdown ? breakdown.normalOtPaidHrs : 0,
      friday_ot_amount: isFridayOrHoliday && showTimes ? Number(fridayOtAmount) || 0 : 0,
      is_public_holiday: isPublicHoliday,
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
          {lockedStaffId ? (
            <>
              <div className={inputClass + ' bg-slate-50 text-slate-600 cursor-not-allowed'}>
                {staff[0]?.full_name ?? 'Your account'}
              </div>
            </>
          ) : (
            <select
              value={staffId}
              onChange={(e) => handleStaffChange(e.target.value)}
              required
              className={inputClass}
            >
              <option value="">Select staff member…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}{s.designation ? ` — ${s.designation}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className={labelClass}>Date <span className="text-red-500">*</span></label>
          <input
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            required
            className={inputClass}
          />
          {isFridayDate && (
            <p className="text-xs text-purple-600 font-semibold mt-1.5">Friday — overtime rules apply automatically</p>
          )}
        </div>

        {/* Public Holiday toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isPublicHoliday}
              onChange={(e) => handlePublicHolidayToggle(e.target.checked)}
            />
            <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-purple-600 transition-colors" />
            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-all peer-checked:translate-x-5" />
          </div>
          <span className="text-sm font-medium text-slate-700">Public Holiday</span>
          {isPublicHoliday && <span className="text-xs text-purple-600 font-semibold">(overtime rules apply)</span>}
        </label>

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
                {!isFridayOrHoliday && <p className="text-xs text-slate-400 mt-1">Duty starts 8:30 AM</p>}
              </div>
              <div>
                <label className={labelClass}>Check Out</label>
                <input
                  type="time"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className={inputClass}
                />
                {!isFridayOrHoliday && <p className="text-xs text-slate-400 mt-1">Duty ends 5:30 PM</p>}
              </div>
            </div>

            {/* Friday/Holiday fixed OT amount — manually adjustable per record */}
            {isFridayOrHoliday && (
              <div>
                <label className={labelClass}>
                  Friday/Holiday OT Amount (KWD)
                  <span className="ml-1 text-xs text-slate-400 font-normal">pre-filled from staff profile</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fridayOtAmount}
                  onChange={(e) => setFridayOtAmount(e.target.value)}
                  className={`${inputClass} text-right`}
                />
              </div>
            )}

            {/* Live breakdown */}
            {breakdown && checkIn && checkOut && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-200 text-sm overflow-hidden">
                {isFridayOrHoliday ? (
                  <>
                    <div className="px-4 py-3 bg-purple-50">
                      <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
                        {isFridayDate && isPublicHoliday ? 'Friday + Public Holiday' : isFridayDate ? 'Friday OT Rules' : 'Public Holiday OT Rules'}
                      </p>
                      <p className="text-xs text-purple-500 mt-0.5">No regular hours — entire shift counts as overtime</p>
                    </div>

                    <div className={`px-4 py-3 ${breakdown.fixedOtHrs > 0 ? 'bg-blue-50' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-800">Fixed Overtime Hours</p>
                          <p className="text-xs text-slate-400 mt-0.5">First 8 hours worked</p>
                        </div>
                        <p className="font-bold text-blue-700 text-base">{fmtHrs(breakdown.fixedOtHrs)}</p>
                      </div>
                      {breakdown.lunchDeducted && (
                        <p className="text-xs text-slate-400 mt-1">Lunch break (1:00–2:00 PM) deducted</p>
                      )}
                    </div>

                    {breakdown.normalOtActualHrs > 0 ? (
                      <div className="flex items-center justify-between px-4 py-3 bg-amber-50">
                        <div>
                          <p className="font-semibold text-amber-800">Additional OT (beyond 8h)</p>
                          <p className="text-xs text-amber-600 mt-0.5">
                            {fmtHrs(breakdown.normalOtActualHrs)} actual × 1.25 = {fmtHrs(breakdown.normalOtPaidHrs)} paid
                          </p>
                        </div>
                        <p className="font-bold text-amber-700 text-base">{fmtHrs(breakdown.normalOtPaidHrs)}</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="font-semibold text-slate-600">Additional OT (beyond 8h)</p>
                          <p className="text-xs text-slate-400 mt-0.5">Only if worked more than 8 hours</p>
                        </div>
                        <p className="text-slate-400 text-sm">—</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="font-semibold text-slate-800">Regular Hours</p>
                        {breakdown.lunchDeducted && (
                          <p className="text-xs text-slate-400 mt-0.5">Lunch break (1:00–2:00 PM) deducted</p>
                        )}
                      </div>
                      <p className="font-bold text-slate-900 text-base">{fmtHrs(breakdown.hoursWorked)}</p>
                    </div>

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

                    {breakdown.normalOtActualHrs > 0 ? (
                      <div className="flex items-center justify-between px-4 py-3 bg-amber-50">
                        <div>
                          <p className="font-semibold text-amber-800">Normal Overtime (after 8 PM)</p>
                          <p className="text-xs text-amber-600 mt-0.5">
                            {fmtHrs(breakdown.normalOtActualHrs)} actual × 1.25 = {fmtHrs(breakdown.normalOtPaidHrs)} paid
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
                  </>
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
