import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { Plus, CalendarCheck, UserCheck, XCircle, Clock } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { StaffFilterSelect } from './StaffFilterSelect'

export const metadata = { title: 'Attendance' }

function getMonthLabel(ym: string) {
  const [year, month] = ym.split('-').map(Number)
  return new Intl.DateTimeFormat('en-AE', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
}

function prevMonth(ym: string) {
  const [year, month] = ym.split('-').map(Number)
  const d = new Date(year, month - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nextMonth(ym: string) {
  const [year, month] = ym.split('-').map(Number)
  const d = new Date(year, month, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; staff_id?: string }>
}) {
  const params = await searchParams
  const today = new Date()
  const currentMonth =
    params.month ??
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const selectedStaffId = params.staff_id ?? ''

  const supabase = await createClient()

  const { data: staffRaw } = await supabase
    .from('staff')
    .select('id, full_name')
    .eq('employment_status', 'active')
    .order('full_name')

  const staffList = (staffRaw ?? []) as Array<{ id: string; full_name: string }>

  // Build date range for selected month
  const [yr, mo] = currentMonth.split('-').map(Number)
  const startDate = `${currentMonth}-01`
  const lastDay = new Date(yr, mo, 0).getDate()
  const endDate = `${currentMonth}-${String(lastDay).padStart(2, '0')}`

  let query = (supabase as any)
    .from('attendance')
    .select('id, staff_id, date, check_in, check_out, hours_worked, overtime_hours, status, notes, staff(full_name)')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })

  if (selectedStaffId) {
    query = query.eq('staff_id', selectedStaffId)
  }

  const { data: recordsRaw } = await query.limit(200)

  const records = (recordsRaw ?? []) as Array<{
    id: string
    staff_id: string
    date: string
    check_in: string | null
    check_out: string | null
    hours_worked: number
    overtime_hours: number
    status: string
    notes: string | null
    staff: { full_name: string } | null
  }>

  // Summary
  const summary = {
    present: records.filter((r) => r.status === 'present').length,
    absent: records.filter((r) => r.status === 'absent').length,
    half_day: records.filter((r) => r.status === 'half_day').length,
    leave: records.filter((r) => r.status === 'leave').length,
    overtime: records.reduce((s, r) => s + (r.overtime_hours ?? 0), 0),
  }

  const prev = prevMonth(currentMonth)
  const next = nextMonth(currentMonth)
  const isCurrentMonth = currentMonth === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const buildHref = (m: string) => {
    const qs = new URLSearchParams()
    qs.set('month', m)
    if (selectedStaffId) qs.set('staff_id', selectedStaffId)
    return `/attendance?${qs.toString()}`
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Attendance"
        subtitle="Track daily staff attendance"
        actions={
          <Link
            href="/attendance/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Mark Attendance
          </Link>
        }
      />

      <div className="p-6 space-y-5">
        {/* Month Navigator + Staff Filter */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1">
            <Link
              href={buildHref(prev)}
              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              ←
            </Link>
            <span className="px-3 text-sm font-semibold text-slate-900 min-w-[140px] text-center">
              {getMonthLabel(currentMonth)}
            </span>
            <Link
              href={buildHref(next)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                isCurrentMonth
                  ? 'text-slate-300 pointer-events-none'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              →
            </Link>
          </div>

          <StaffFilterSelect staffList={staffList} selectedStaffId={selectedStaffId} currentMonth={currentMonth} />
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Present', value: summary.present, icon: UserCheck, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Absent', value: summary.absent, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Half Day', value: summary.half_day, icon: CalendarCheck, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Leave', value: summary.leave, icon: CalendarCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'OT Hours', value: summary.overtime.toFixed(1), icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-2`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Attendance Table */}
        {records.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <CalendarCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No attendance records for {getMonthLabel(currentMonth)}</p>
            <Link
              href="/attendance/new"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Mark Attendance
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Date</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Staff</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Check In</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Check Out</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Hours</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">OT Hrs</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3 hidden xl:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-semibold text-slate-900">{formatDate(r.date)}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-700">{r.staff?.full_name ?? '—'}</td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[r.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 hidden md:table-cell">{r.check_in ?? '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 hidden md:table-cell">{r.check_out ?? '—'}</td>
                    <td className="px-4 py-3.5 text-right text-sm text-slate-600 hidden lg:table-cell">
                      {r.hours_worked > 0 ? `${r.hours_worked}h` : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right hidden lg:table-cell">
                      {r.overtime_hours > 0 ? (
                        <span className="text-sm font-semibold text-purple-600">{r.overtime_hours}h</span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-500 hidden xl:table-cell max-w-[180px] truncate">
                      {r.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
