import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { calcAttendanceBreakdown, isFriday, payableOvertimeHours } from '@/lib/attendance'

// Attendance is not yet represented in the manually maintained Database type.
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(request: NextRequest) {
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users')
      .select('organization_id, role, status')
      .eq('id', user.id)
      .single()
    const profile = profileRaw as { organization_id: string; role: string; status: string } | null
    if (!profile?.organization_id || profile.status !== 'active') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const privileged = ['owner', 'admin', 'hr', 'manager']
    const isKiosk = profile.role === 'attendance_kiosk'
    if (!privileged.includes(profile.role) && !isKiosk) {
      return NextResponse.json({ error: 'Use My Attendance to clock in or out' }, { status: 403 })
    }

    const body = await request.json()
    const {
      staff_id,
      date,
      check_in,
      check_out,
      hours_worked,
      overtime_hours,
      status,
      notes,
      is_public_holiday,
    } = body

    if (!staff_id) return NextResponse.json({ error: 'Staff member is required' }, { status: 400 })
    if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    const dateParts = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date.split('-').map(Number)
      : []
    const parsedDate = dateParts.length === 3
      ? new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]))
      : null
    if (!parsedDate || parsedDate.getUTCFullYear() !== dateParts[0]
      || parsedDate.getUTCMonth() !== dateParts[1] - 1
      || parsedDate.getUTCDate() !== dateParts[2]) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }
    if (!status) return NextResponse.json({ error: 'Status is required' }, { status: 400 })
    const allowedStatuses = ['present', 'absent', 'half_day', 'leave', 'sick_leave']
    if (!allowedStatuses.includes(status)) {
      const error = status === 'unpaid_leave'
        ? 'Unpaid leave attendance can only be created through an approved annual leave application'
        : 'Invalid attendance status'
      return NextResponse.json({ error }, { status: 400 })
    }

    if (isKiosk) {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })
      if (date !== today) {
        return NextResponse.json({ error: 'You can only mark attendance for today' }, { status: 403 })
      }
      if (is_public_holiday) {
        return NextResponse.json({ error: 'Only an administrator can mark a public holiday' }, { status: 403 })
      }
      if (!['present', 'half_day'].includes(status)) {
        return NextResponse.json({ error: 'The kiosk can only record worked attendance' }, { status: 403 })
      }
    }

    const supabase = createAdminClient()

    // Non-eligible staff get no daily OT, but they do get Friday/holiday OT —
    // including the additional hours beyond the first 8 on such a day.
    const { data: staffData } = await (supabase as any)
      .from('staff')
      .select('overtime_eligible, friday_ot_amount, employment_status')
      .eq('id', staff_id)
      .eq('organization_id', profile.organization_id)
      .maybeSingle()
    if (!staffData) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
    if (typeof notes === 'string' && notes.length > 500) {
      return NextResponse.json({ error: 'Notes must be 500 characters or fewer' }, { status: 400 })
    }

    const staff = staffData as {
      overtime_eligible: boolean
      friday_ot_amount: number | null
      employment_status: string
    }
    if (isKiosk && staff.employment_status !== 'active') {
      return NextResponse.json({ error: 'The kiosk can only mark active employees in this organization' }, { status: 403 })
    }

    const isOtEligible = staff.overtime_eligible
    const isHoliday = isFriday(date) || Boolean(is_public_holiday)
    if (isKiosk && [check_in, check_out].some((value) => {
      if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return true
      const [hour, minute] = value.split(':').map(Number)
      return hour > 23 || minute > 59
    })) {
      return NextResponse.json({ error: 'Check-in and check-out times are required' }, { status: 400 })
    }

    // Check for existing record (technician may have already self-clocked in)
    const { data: existing } = await (supabase as any)
      .from('attendance')
      .select('id, leave_application_id')
      .eq('organization_id', profile.organization_id)
      .eq('staff_id', staff_id)
      .eq('date', date)
      .maybeSingle()

    const kioskBreakdown = isKiosk
      ? calcAttendanceBreakdown(check_in, check_out, isHoliday, date)
      : null
    if (isKiosk && !kioskBreakdown) {
      return NextResponse.json({ error: 'Check-in and check-out times are invalid' }, { status: 400 })
    }

    const payload = {
      check_in: check_in || null,
      check_out: check_out || null,
      hours_worked: kioskBreakdown?.hoursWorked ?? Number(hours_worked ?? 0),
      overtime_hours: payableOvertimeHours(
        kioskBreakdown?.normalOtPaidHrs ?? Number(overtime_hours ?? 0),
        {
          overtimeEligible: isOtEligible,
          isFridayOrHoliday: isHoliday,
        }
      ),
      status,
      notes: notes?.trim() || null,
      is_public_holiday: Boolean(is_public_holiday ?? false),
      friday_ot_amount: isKiosk && isHoliday
        ? Number(staff.friday_ot_amount ?? 0)
        : Number(body.friday_ot_amount ?? 0),
    }

    let record, error
    if (existing?.leave_application_id) {
      return NextResponse.json({ error: 'Approved leave attendance cannot be overwritten directly. Resolve the leave application first.' }, { status: 409 })
    }
    if (existing) {
      // Update the existing record (e.g. technician self-clocked in — admin finalises at end of day)
      ;({ data: record, error } = await (supabase as any)
        .from('attendance')
        .update(payload)
        .eq('id', existing.id)
        .eq('organization_id', profile.organization_id)
        .is('leave_application_id', null)
        .select('id')
        .maybeSingle())
    } else {
      ;({ data: record, error } = await (supabase as any)
        .from('attendance')
        .insert({ organization_id: profile.organization_id, staff_id, date, ...payload, created_by: user.id })
        .select('id').single())
    }

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Attendance was already recorded for this employee and date. Reload and try again.' }, { status: 409 })
      }
      throw error
    }
    if (!record) {
      return NextResponse.json({ error: 'Attendance changed while saving. Reload and try again.' }, { status: 409 })
    }

    return NextResponse.json({ id: record.id })
  } catch (err: unknown) {
    console.error('Create attendance error:', err)
    return NextResponse.json({ error: 'Unable to save attendance' }, { status: 500 })
  }
}
