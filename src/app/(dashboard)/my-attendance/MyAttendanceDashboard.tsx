'use client'

import { useState } from 'react'
import { LogIn, LogOut, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface AttendanceRecord {
  id: string
  check_in: string | null
  check_out: string | null
  hours_worked: number
  overtime_hours: number
  status: string
}

interface HistoryRecord {
  id: string
  date: string
  check_in: string | null
  check_out: string | null
  hours_worked: number
  status: string
}

const STATUS_COLOR: Record<string, string> = {
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-700',
  half_day: 'bg-amber-100 text-amber-700',
  leave: 'bg-blue-100 text-blue-700',
}

const STATUS_LABEL: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  half_day: 'Half Day',
  leave: 'Leave',
}

export function MyAttendanceDashboard({
  staffLinked,
  initialAttendance,
  recentRecords,
  today,
}: {
  staffLinked: boolean
  initialAttendance: AttendanceRecord | null
  recentRecords: HistoryRecord[]
  today: string
}) {
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(initialAttendance)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function clockAction(action: 'clock_in' | 'clock_out') {
    setLoading(true)
    setError('')
    let lat: number | undefined, lng: number | undefined
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation?.getCurrentPosition(resolve, reject, { timeout: 6000 }) ?? reject()
      )
      lat = pos.coords.latitude
      lng = pos.coords.longitude
    } catch { /* location is optional */ }

    try {
      const res = await fetch('/api/technician/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, lat, lng }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      setAttendance(data.record)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!staffLinked) {
    return (
      <div className="p-6">
        <div className="max-w-lg bg-amber-50 border border-amber-200 rounded-xl px-6 py-8 text-center">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="font-semibold text-amber-800 mb-2">Account not linked to a staff profile</p>
          <p className="text-sm text-amber-700">Ask HR to link your login account in Staff settings before you can clock in.</p>
        </div>
      </div>
    )
  }

  const doneForDay = !!attendance?.check_out

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Today's card */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Today — {formatDate(today)}</h2>
        </div>
        <div className="p-6 text-center">
          {error && (
            <div className="mb-5 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm text-left">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          {!attendance?.check_in ? (
            <>
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <LogIn className="w-10 h-10 text-green-600" />
              </div>
              <p className="text-slate-500 mb-6">You haven't clocked in today yet.</p>
              <button
                onClick={() => clockAction('clock_in')}
                disabled={loading}
                className="w-full max-w-xs py-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-xl text-white font-bold text-base transition-colors mx-auto block"
              >
                {loading ? 'Clocking In...' : 'Clock In'}
              </button>
            </>
          ) : doneForDay ? (
            <>
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <p className="font-bold text-slate-900 text-lg mb-1">Done for today!</p>
              <p className="text-slate-500 text-sm">
                {attendance.check_in} – {attendance.check_out}
                {(attendance.hours_worked ?? 0) > 0 && (
                  <span className="ml-2 font-semibold text-slate-700">· {attendance.hours_worked}h worked</span>
                )}
              </p>
            </>
          ) : (
            <>
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-10 h-10 text-blue-600" />
              </div>
              <p className="font-bold text-slate-900 text-lg mb-1">On Duty</p>
              <p className="text-slate-500 text-sm mb-6">
                Clocked in at <span className="font-semibold text-slate-700">{attendance.check_in}</span>
              </p>
              <button
                onClick={() => clockAction('clock_out')}
                disabled={loading}
                className="w-full max-w-xs py-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl text-white font-bold text-base transition-colors mx-auto block"
              >
                {loading ? 'Clocking Out...' : 'Clock Out'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Recent history */}
      {recentRecords.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Recent Attendance</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Date</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">In</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Out</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recentRecords.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium text-slate-900">{formatDate(r.date)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[r.status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{r.check_in ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{r.check_out ?? '—'}</td>
                  <td className="px-5 py-3 text-right text-sm">
                    {(r.hours_worked ?? 0) > 0
                      ? <span className="font-semibold text-slate-700">{r.hours_worked}h</span>
                      : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
