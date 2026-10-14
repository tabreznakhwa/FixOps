import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { countLeaveDays, LEAVE_TYPES, type LeaveType } from '@/lib/leave'
import { logAudit } from '@/lib/audit'
import { kuwaitISODate } from '@/lib/attendance'

interface Profile {
  userId: string
  organization_id: string
  full_name: string
  role: string
}

function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data } = await admin
    .from('users')
    .select('organization_id, full_name, role, status')
    .eq('id', user.id)
    .single()

  if (!data || data.status !== 'active' || !data.organization_id) return null
  return { ...data, userId: user.id }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role === 'attendance_kiosk') {
      return NextResponse.json({ error: 'The shared attendance kiosk cannot submit personal leave applications' }, { status: 403 })
    }

    const body = await request.json()
    const leaveType = body.leave_type as LeaveType
    const startDate = String(body.start_date ?? '')
    const endDate = String(body.end_date ?? '')
    const reason = String(body.reason ?? '').trim()
    const idempotencyKey = String(body.idempotency_key ?? '').trim() || null

    if (idempotencyKey && idempotencyKey.length > 200) {
      return NextResponse.json({ error: 'Invalid request key' }, { status: 400 })
    }
    if (!LEAVE_TYPES.includes(leaveType)) {
      return NextResponse.json({ error: 'Select a valid leave type' }, { status: 400 })
    }
    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Start and end dates are required' }, { status: 400 })
    }
    if (!isValidISODate(startDate) || !isValidISODate(endDate)) {
      return NextResponse.json({ error: 'Enter valid leave dates' }, { status: 400 })
    }
    if (endDate < startDate) {
      return NextResponse.json({ error: 'End date cannot be before start date' }, { status: 400 })
    }
    if (reason.length < 3) {
      return NextResponse.json({ error: 'Please provide a reason for the leave' }, { status: 400 })
    }
    if (reason.length > 1000) {
      return NextResponse.json({ error: 'Reason must be 1,000 characters or fewer' }, { status: 400 })
    }

    const calendarWorkingDays = countLeaveDays(startDate, endDate)
    if (calendarWorkingDays < 1) {
      return NextResponse.json({ error: 'The selected range contains no working days' }, { status: 400 })
    }
    const rangeDays = Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1
    if (rangeDays > 366) {
      return NextResponse.json({ error: 'A leave application cannot span more than 366 calendar days' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any
    const { data: staff } = await admin
      .from('staff')
      .select('id, organization_id, full_name, joining_date')
      .eq('organization_id', profile.organization_id)
      .eq('user_id', profile.userId)
      .eq('employment_status', 'active')
      .maybeSingle()

    if (!staff) {
      return NextResponse.json({ error: 'Your login is not linked to an active staff profile. Contact an administrator.' }, { status: 400 })
    }
    if (idempotencyKey) {
      const { data: existing, error: existingError } = await admin
        .from('leave_applications')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .eq('staff_id', staff.id)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      if (existingError) {
        console.error('Find existing leave application error:', existingError)
        return NextResponse.json({ error: 'Unable to verify this submission' }, { status: 500 })
      }
      if (existing) {
        const matchesRequest = existing.leave_type === leaveType
          && existing.start_date === startDate
          && existing.end_date === endDate
          && existing.reason === reason
        if (!matchesRequest) {
          return NextResponse.json({ error: 'This request key was already used for a different leave application' }, { status: 409 })
        }
        return NextResponse.json(existing)
      }
    }

    if (startDate < kuwaitISODate()) {
      return NextResponse.json({ error: 'Leave applications cannot start in the past' }, { status: 400 })
    }
    if (startDate < staff.joining_date) {
      return NextResponse.json({ error: `Leave cannot begin before your joining date (${staff.joining_date})` }, { status: 400 })
    }

    const { data: resultRows, error } = await admin.rpc('submit_leave_application', {
      p_org_id: profile.organization_id,
      p_staff_id: staff.id,
      p_submitter_id: profile.userId,
      p_leave_type: leaveType,
      p_start_date: startDate,
      p_end_date: endDate,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    })

    if (error) {
      const rawMessage = error.message?.replace(/^Error:\s*/, '') ?? ''
      const knownMessage = [
        'Select a valid leave type',
        'Start and end dates are required',
        'Enter valid leave dates',
        'End date cannot be before start date',
        'A leave application cannot span more than 366 calendar days',
        'Reason must be between 3 and 1,000 characters',
        'Invalid request key',
        'Leave applications cannot start in the past',
        'Your login is not linked to an active staff profile',
        'Leave cannot begin before your joining date',
        'The selected range contains no working days',
        'This request key was already used for a different leave application',
        'Payroll has already been processed for part of this leave period',
      ].find((message) => rawMessage.includes(message))

      const isOverlap = error.code === '23P01'
      if (!knownMessage && !isOverlap) {
        console.error('Submit leave application RPC error:', error)
        return NextResponse.json({ error: 'Unable to submit the leave application' }, { status: 500 })
      }

      const message = isOverlap
        ? 'You already have a pending or approved leave application in this period'
        : knownMessage!
      const status = isOverlap
        || message.includes('already used for a different leave application')
        || message.includes('Payroll has already been processed')
        ? 409
        : 400
      return NextResponse.json({ error: message }, { status })
    }

    const result = Array.isArray(resultRows) ? resultRows[0] : resultRows
    const data = result?.application
    if (!data) {
      console.error('Submit leave application returned no row')
      return NextResponse.json({ error: 'Unable to submit the leave application' }, { status: 500 })
    }

    if (result.created) {
      const requestedDays = Number(data.requested_days)
      await logAudit({
        orgId: profile.organization_id,
        userId: profile.userId,
        userName: profile.full_name,
        action: 'create',
        entityType: 'leave_application',
        entityId: data.id,
        entityLabel: `${staff.full_name}: ${startDate} to ${endDate}`,
        changes: { leave_type: leaveType, requested_days: requestedDays },
      })
    }

    return NextResponse.json(data, { status: result.created ? 201 : 200 })
  } catch (error: unknown) {
    console.error('Create leave application error:', error)
    return NextResponse.json({ error: 'Unable to submit the leave application' }, { status: 500 })
  }
}
