import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { isFriday, payableOvertimeHours } from '@/lib/attendance'

// Attendance is not yet represented in the manually maintained Database type.
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users').select('organization_id, role').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const allowed = ['owner', 'admin', 'hr', 'manager']
    if (!allowed.includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { date, check_in, check_out, hours_worked, overtime_hours, status, notes, is_public_holiday } = body

    if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    if (!status) return NextResponse.json({ error: 'Status is required' }, { status: 400 })

    const admin = createAdminClient() as any

    // Non-eligible staff get no daily OT, but they do get Friday/holiday OT —
    // including the additional hours beyond the first 8 on such a day.
    const { data: attRec } = await admin
      .from('attendance')
      .select('staff_id, leave_application_id')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .maybeSingle()
    if (!attRec) return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 })
    if (attRec.leave_application_id) {
      return NextResponse.json({ error: 'Approved leave attendance cannot be edited directly. Resolve the leave application first.' }, { status: 409 })
    }
    let isOtEligible = true
    if (attRec?.staff_id) {
      const { data: staffData } = await admin
        .from('staff').select('overtime_eligible').eq('id', attRec.staff_id).single()
      isOtEligible = (staffData as { overtime_eligible: boolean } | null)?.overtime_eligible ?? true
    }
    const isHoliday = isFriday(date) || Boolean(is_public_holiday)

    const { data: updated, error } = await admin
      .from('attendance')
      .update({
        date,
        check_in: check_in || null,
        check_out: check_out || null,
        hours_worked: Number(hours_worked ?? 0),
        overtime_hours: payableOvertimeHours(Number(overtime_hours ?? 0), {
          overtimeEligible: isOtEligible,
          isFridayOrHoliday: isHoliday,
        }),
        status,
        notes: notes?.trim() || null,
        is_public_holiday: Boolean(is_public_holiday ?? false),
        friday_ot_amount: Number(body.friday_ot_amount ?? 0),
      })
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .is('leave_application_id', null)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!updated) {
      return NextResponse.json({ error: 'Attendance changed while saving. Reload and try again.' }, { status: 409 })
    }
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users').select('organization_id, role').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!['owner', 'admin', 'hr', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient() as any
    const { data: existing } = await admin
      .from('attendance')
      .select('leave_application_id')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 })
    if (existing.leave_application_id) {
      return NextResponse.json({ error: 'Approved leave attendance cannot be deleted directly. Resolve the leave application first.' }, { status: 409 })
    }

    const { data: deleted, error } = await admin
      .from('attendance')
      .delete()
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .is('leave_application_id', null)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!deleted) {
      return NextResponse.json({ error: 'Attendance changed while deleting. Reload and try again.' }, { status: 409 })
    }
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
