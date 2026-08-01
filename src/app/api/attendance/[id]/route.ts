import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { isFriday, payableOvertimeHours } from '@/lib/attendance'

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
      .from('attendance').select('staff_id').eq('id', id).single()
    let isOtEligible = true
    if (attRec?.staff_id) {
      const { data: staffData } = await admin
        .from('staff').select('overtime_eligible').eq('id', attRec.staff_id).single()
      isOtEligible = (staffData as { overtime_eligible: boolean } | null)?.overtime_eligible ?? true
    }
    const isHoliday = isFriday(date) || Boolean(is_public_holiday)

    const { error } = await admin
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

    if (error) throw error
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
    const { error } = await admin
      .from('attendance')
      .delete()
      .eq('id', id)
      .eq('organization_id', profile.organization_id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
