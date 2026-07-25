import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { RefreshButton } from '@/components/ui/RefreshButton'
import Link from 'next/link'
import { Plus, CalendarCheck, UserCheck, XCircle, Clock, Pencil } from 'lucide-react'
import { DeleteAttendanceButton } from './DeleteAttendanceButton'
import { formatDate } from '@/lib/utils'
import { isFriday } from '@/lib/attendance'
import { StaffFilterSelect } from './StaffFilterSelect'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Attendance' }

function computeTotalHours(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 0
  const [inH, inM] = checkIn.split(':').map(Number)
  const [outH, outM] = checkOut.split(':').map(Number)
  let totalMins = (outH * 60 + outM) - (inH * 60 + inM)
  if (totalMins < 0) totalMins += 24 * 60
  if (inH * 60 + inM <= 13 * 60 && outH * 60 + outM >= 14 * 60) totalMins -= 60
  return Math.round(totalMins / 60 * 10) / 10
}

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
  searchParams: Promise<{ month?: string; staff_id?: string; period?: string }>
}) {
  const params = await searchParams
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const currentMonth =
    params.month ??
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const period = params.period ?? ''
  const selectedStaffId = params.staff_id ?? ''

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await (supabase as any).from('users').select('role').eq('id', user!.id).single()
  const userRole = (profileRaw as { role: string } | null)?.role ?? ''

  // Non-admin staff have their own self-service page — block access to the full staff list
  if (userRole === 'technician' || userRole === 'attendance_kiosk') redirect('/my-attendance')

  const isKiosk = userRole === 'attendance_kiosk'
  const canEdit = ['owner', 'admin', 'hr', 'manager'].includes(userRole)

  // Kiosk users see only their own records — look up their linked staff record
  let kioskStaffId: string | null = null
  let kioskTodayMarked = false
  if (isKiosk) {
    const { data: kioskStaff } = await (supabase as any)
      .from('staff').select('id').eq('user_id', user!.id).maybeSingle()
    kioskStaffId = (kioskStaff as { id: string } | null)?.id ?? null
    if (kioskStaffId) {
      const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })
      const { data: todayRec } = await (supabase as any)
        .from('attendance').select('id').eq('staff_id', kioskStaffId).eq('date', todayISO).maybeSingle()
      kioskTodayMarked = !!todayRec
    }
  }

  const { data: staffRaw } = await supabase
    .from('staff')
    .select('id, full_name')
    .eq('employment_status', 'active')
    .order('full_name')

  const staffList = (staffRaw ?? []) as Array<{ id: string; full_name: string }>

  // Build date range — period takes precedence over month
  let startDate: string
  let endDate: string
  let periodLabel: string | null = null

  if (period === 'today') {
    startDate = endDate = todayStr
    periodLabel = 'Today'
  } else if (period === 'yesterday') {
    const yest = new Date(today)
    yest.setDate(yest.getDate() - 1)
    startDate = endDate = `${yest.getFullYear()}-${pad(yest.getMonth() + 1)}-${pad(yest.getDate())}`
    periodLabel = 'Yesterday'
  } else if (period === 'this_week') {
    const dow = today.getDay() // 0=Sun
    const daysSinceSun = dow
    const sun = new Date(today)
    sun.setDate(today.getDate() - daysSinceSun)
    startDate = `${sun.getFullYear()}-${pad(sun.getMonth() + 1)}-${pad(sun.getDate())}`
    endDate = todayStr
    periodLabel = 'This Week'
  } else if (period === 'this_month') {
    startDate = `${currentMonth}-01`
    endDate = todayStr
    periodLabel = 'This Month'
  } else {
    const [yr, mo] = currentMonth.split('-').map(Number)
    startDate = `${currentMonth}-01`
    const lastDay = new Date(yr, mo, 0).getDate()
    endDate = `${currentMonth}-${String(lastDay).padStart(2, '0')}`
  }

  let query = (supabase as any)
    .from('attendance')
    .select('id, staff_id, date, check_in, check_out, hours_worked, overtime_hours, status, notes, is_public_holiday, friday_ot_amount, staff(full_name)')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })

  // Kiosk: always force-filter to their own staff_id (ignore URL param)
  // If staff not yet linked, use an impossible UUID so zero records show
  if (isKiosk) {
    query = query.eq('staff_id', kioskStaffId ?? '00000000-0000-0000-0000-000000000000')
  } else if (selectedStaffId) {
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
    is_public_holiday: boolean
    friday_ot_amount: number
    staff: { full_name: string } | null
  }>

  // Summary
  const summary = {
    present: records.filter((r) => r.status === 'present').length,
    absent: records.filter((r) => r.status === 'absent').length,
    half_day: records.filter((r) => r.status === 'half_day').length,
    leave: records.filter((r) => r.status === 'leave').length,
    overtime: records.reduce((s, r) => s + (r.overtime_hours ?? 0), 0),
    fridayOt: records.reduce((s, r) => s + (r.friday_ot_amount ?? 0), 0),
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

  const buildPeriodHref = (p: string) => {
    const qs = new URLSearchParams()
    qs.set('month', currentMonth)
    if (selectedStaffId) qs.set('staff_id', selectedStaffId)
    if (p !== period) qs.set('period', p)
    return `/attendance?${qs.toString()}`
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Attendance"
        subtitle="Track daily staff attendance"
        actions={
          <div className="flex items-center gap-2">
            <RefreshButton />
            {isKiosk && kioskTodayMarked ? (
              <span className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 text-sm font-semibold rounded-lg">
                <CalendarCheck className="w-4 h-4" /> Today Already Marked
              </span>
            ) : (
              <Link
                href={isKiosk && kioskStaffId ? `/attendance/new?locked_staff_id=${kioskStaffId}` : '/attendance/new'}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Mark Attendance
              </Link>
            )}
          </div>
        }
      />

      <div className="p-6 space-y-5">
        {/* Quick Period Tabs */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Today', value: 'today' },
            { label: 'Yesterday', value: 'yesterday' },
            { label: 'This Week', value: 'this_week' },
            { label: 'This Month', value: 'this_month' },
          ].map(({ label, value }) => (
            <Link
              key={value}
              href={buildPeriodHref(value)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === value
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

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

          {!isKiosk && <StaffFilterSelect staffList={staffList} selectedStaffId={selectedStaffId} currentMonth={currentMonth} />}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: 'Present', value: summary.present, icon: UserCheck, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Absent', value: summary.absent, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Half Day', value: summary.half_day, icon: CalendarCheck, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Leave', value: summary.leave, icon: CalendarCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Fri/Hol OT', value: `KWD ${summary.fridayOt.toFixed(3)}`, icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Add. OT Hrs', value: summary.overtime.toFixed(1), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
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
            <p className="text-slate-500 font-medium">No attendance records for {periodLabel ?? getMonthLabel(currentMonth)}</p>
            {!(isKiosk && kioskTodayMarked) && (
              <Link
                href={isKiosk && kioskStaffId ? `/attendance/new?locked_staff_id=${kioskStaffId}` : '/attendance/new'}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Mark Attendance
              </Link>
            )}
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
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Friday/Holiday OT</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Add. OT Hrs</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3 hidden xl:table-cell">Notes</th>
                  {canEdit && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-semibold text-slate-900">{formatDate(r.date)}</p>
                      {(r.is_public_holiday || isFriday(r.date)) && (
                        <span className="text-xs font-semibold text-purple-600">
                          {r.is_public_holiday && isFriday(r.date) ? 'Fri + Holiday' : r.is_public_holiday ? 'Holiday' : 'Friday'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-700">{r.staff?.full_name ?? '—'}</td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[r.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 hidden md:table-cell">{r.check_in ?? '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 hidden md:table-cell">{r.check_out ?? '—'}</td>
                    <td className="px-4 py-3.5 text-right hidden lg:table-cell">
                      {r.hours_worked > 0 ? (
                        <span className="text-sm text-slate-600">{r.hours_worked}h</span>
                      ) : (r.is_public_holiday || isFriday(r.date)) && r.check_in && r.check_out ? (
                        <span className="text-sm font-semibold text-purple-600">{computeTotalHours(r.check_in, r.check_out)}h OT</span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right hidden lg:table-cell">
                      {(r.is_public_holiday || isFriday(r.date)) && r.friday_ot_amount > 0 ? (
                        <span className="text-sm font-semibold text-purple-600">KWD {r.friday_ot_amount.toFixed(3)}</span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right hidden lg:table-cell">
                      {r.overtime_hours > 0 ? (
                        <span className="text-sm font-semibold text-amber-600">{r.overtime_hours}h</span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-500 hidden xl:table-cell max-w-[180px] truncate">
                      {r.notes ?? '—'}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <Link href={`/attendance/${r.id}/edit`}
                            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </Link>
                          <DeleteAttendanceButton id={r.id} />
                        </div>
                      </td>
                    )}
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
