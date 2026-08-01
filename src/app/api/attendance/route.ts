import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { isFriday, payableOvertimeHours } from '@/lib/attendance'

export async function POST(request: NextRequest) {
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    if (!status) return NextResponse.json({ error: 'Status is required' }, { status: 400 })

    const privileged = ['owner', 'admin', 'hr', 'manager']
    if (!privileged.includes(profile.role)) {
      const today = new Date().toISOString().split('T')[0]
      if (date !== today) {
        return NextResponse.json({ error: 'You can only mark attendance for today' }, { status: 403 })
      }
    }

    const supabase = createAdminClient()

    // Non-eligible staff get no daily OT, but they do get Friday/holiday OT —
    // including the additional hours beyond the first 8 on such a day.
    const { data: staffData } = await (supabase as any)
      .from('staff')
      .select('overtime_eligible')
      .eq('id', staff_id)
      .single()
    const isOtEligible = (staffData as { overtime_eligible: boolean } | null)?.overtime_eligible ?? true
    const isHoliday = isFriday(date) || Boolean(is_public_holiday)

    // Check for existing record (technician may have already self-clocked in)
    const { data: existing } = await (supabase as any)
      .from('attendance')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('staff_id', staff_id)
      .eq('date', date)
      .maybeSingle()

    const payload = {
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
    }

    let record, error
    if (existing) {
      // Update the existing record (e.g. technician self-clocked in — admin finalises at end of day)
      ;({ data: record, error } = await (supabase as any)
        .from('attendance').update(payload).eq('id', existing.id).select('id').single())
    } else {
      ;({ data: record, error } = await (supabase as any)
        .from('attendance')
        .insert({ organization_id: profile.organization_id, staff_id, date, ...payload, created_by: user.id })
        .select('id').single())
    }

    if (error) throw error

    return NextResponse.json({ id: record.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Create attendance error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
