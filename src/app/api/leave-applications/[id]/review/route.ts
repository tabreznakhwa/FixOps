import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { ADMIN_LEAVE_ROLES, LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/leave'
import { logAudit } from '@/lib/audit'

export async function POST(request: NextRequest, context: RouteContext<'/api/leave-applications/[id]/review'>) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any
    const { data: profile } = await admin
      .from('users')
      .select('organization_id, role, full_name, status')
      .eq('id', user.id)
      .single()

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!ADMIN_LEAVE_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: 'Only an owner or admin can review leave applications' }, { status: 403 })
    }

    const { id } = await context.params
    const body = await request.json()
    const decision = String(body.decision ?? '')
    const reviewNote = String(body.review_note ?? '').trim()

    if (decision !== 'approved' && decision !== 'rejected') {
      return NextResponse.json({ error: 'Decision must be approved or rejected' }, { status: 400 })
    }
    if (decision === 'rejected' && !reviewNote) {
      return NextResponse.json({ error: 'Enter a reason for rejecting the application' }, { status: 400 })
    }
    if (reviewNote.length > 1000) {
      return NextResponse.json({ error: 'Review note must be 1,000 characters or fewer' }, { status: 400 })
    }

    const { data: existing, error: existingError } = await admin
      .from('leave_applications')
      .select('id, organization_id, staff_id, leave_type, start_date, end_date, requested_days, status, staff:staff!leave_applications_org_staff_fkey(full_name)')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .maybeSingle()

    if (existingError) {
      console.error('Load leave application for review error:', existingError)
      return NextResponse.json({ error: 'Unable to load the leave application' }, { status: 500 })
    }
    if (!existing) return NextResponse.json({ error: 'Leave application not found' }, { status: 404 })

    if (existing.status === decision) return NextResponse.json(existing)
    if (existing.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending leave applications can be reviewed' }, { status: 409 })
    }

    const { data: resultRows, error } = await admin.rpc('review_leave_application', {
      p_application_id: id,
      p_org_id: profile.organization_id,
      p_reviewer_id: user.id,
      p_decision: decision,
      p_review_note: reviewNote || null,
    })

    if (error) {
      const rawMessage = error.message?.replace(/^Error:\s*/, '') ?? ''
      const knownMessage = [
        'Decision must be approved or rejected',
        'Review note must be 1,000 characters or fewer',
        'A rejection reason is required',
        'Only an owner or admin can review leave applications',
        'Leave application not found',
        'Only pending leave applications can be reviewed',
        'Employee not found in this organization',
        'Leave can only be approved for an active employee',
        'The selected range contains no working days',
        'Payroll has already been processed for part of this leave period',
        'Attendance already exists for:',
        'Attendance changed while approving leave for',
      ].find((message) => rawMessage.includes(message))
      if (!knownMessage) {
        console.error('Review leave application RPC error:', error)
        return NextResponse.json({ error: 'Unable to review the application' }, { status: 500 })
      }
      const status = knownMessage === 'Leave application not found'
        ? 404
        : knownMessage.includes('Attendance')
          || knownMessage.includes('Payroll has already been processed')
          || knownMessage === 'Only pending leave applications can be reviewed'
          ? 409
          : 400
      return NextResponse.json({ error: rawMessage }, { status })
    }

    const result = Array.isArray(resultRows) ? resultRows[0] : resultRows
    const data = result?.application
    if (!data) {
      console.error('Review leave application returned no row')
      return NextResponse.json({ error: 'Unable to review the application' }, { status: 500 })
    }

    if (result.changed) {
      const staffName = Array.isArray(existing.staff)
        ? existing.staff[0]?.full_name
        : existing.staff?.full_name
      const leaveLabel = LEAVE_TYPE_LABELS[existing.leave_type as LeaveType]

      await logAudit({
        orgId: profile.organization_id,
        userId: user.id,
        userName: profile.full_name,
        action: decision === 'approved' ? 'approve' : 'reject',
        entityType: 'leave_application',
        entityId: id,
        entityLabel: `${staffName ?? 'Employee'}: ${leaveLabel}, ${existing.start_date} to ${existing.end_date}`,
        changes: {
          status: { before: existing.status, after: decision },
          review_note: reviewNote || null,
          attendance_days: decision === 'approved' ? data.requested_days : 0,
        },
      })
    }

    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error('Review leave application error:', error)
    return NextResponse.json({ error: 'Unable to review the leave application' }, { status: 500 })
  }
}
