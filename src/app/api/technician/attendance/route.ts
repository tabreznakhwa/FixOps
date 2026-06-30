import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { calcAttendanceBreakdown, kuwaitISODate, kuwaitTimeHHMM } from '@/lib/attendance'

async function resolveStaff(userId: string) {
  const admin = createAdminClient() as any
  const { data } = await admin
    .from('staff')
    .select('id, organization_id')
    .eq('user_id', userId)
    .eq('employment_status', 'active')
    .maybeSingle()
  return data as { id: string; organization_id: string } | null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staff = await resolveStaff(user.id)
  if (!staff) return NextResponse.json({ linked: false, record: null })

  const admin = createAdminClient() as any
  const { data: record } = await admin
    .from('attendance')
    .select('id, check_in, check_out, hours_worked, overtime_hours')
    .eq('staff_id', staff.id)
    .eq('date', kuwaitISODate())
    .maybeSingle()

  return NextResponse.json({ linked: true, record: record ?? null })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const staff = await resolveStaff(user.id)
    if (!staff) {
      return NextResponse.json({ error: 'Your login is not linked to a staff profile yet. Contact HR.' }, { status: 400 })
    }

    const { action, lat, lng } = await request.json()
    if (action !== 'clock_in' && action !== 'clock_out') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    const hasCoords = typeof lat === 'number' && typeof lng === 'number'

    const admin = createAdminClient() as any
    const today = kuwaitISODate()
    const nowTime = kuwaitTimeHHMM()

    const { data: existing } = await admin
      .from('attendance')
      .select('id, check_in, check_out')
      .eq('staff_id', staff.id)
      .eq('date', today)
      .maybeSingle()

    if (action === 'clock_in') {
      if (existing) return NextResponse.json({ record: existing }) // already clocked in — idempotent
      const { data: record, error } = await admin
        .from('attendance')
        .insert({
          organization_id: staff.organization_id,
          staff_id: staff.id,
          date: today,
          check_in: nowTime,
          status: 'present',
          created_by: user.id,
          ...(hasCoords ? { check_in_lat: lat, check_in_lng: lng } : {}),
        })
        .select('id, check_in, check_out, hours_worked, overtime_hours')
        .single()
      if (error) throw error
      return NextResponse.json({ record })
    }

    // clock_out
    if (!existing || !existing.check_in) {
      return NextResponse.json({ error: "You haven't clocked in yet today." }, { status: 400 })
    }
    if (existing.check_out) {
      return NextResponse.json({ record: existing }) // already clocked out — idempotent
    }

    const breakdown = calcAttendanceBreakdown(existing.check_in, nowTime)
    const { data: record, error } = await admin
      .from('attendance')
      .update({
        check_out: nowTime,
        hours_worked: breakdown?.hoursWorked ?? 0,
        overtime_hours: breakdown?.normalOtPaidHrs ?? 0,
        ...(hasCoords ? { check_out_lat: lat, check_out_lng: lng } : {}),
      })
      .eq('id', existing.id)
      .select('id, check_in, check_out, hours_worked, overtime_hours')
      .single()
    if (error) throw error
    return NextResponse.json({ record })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Technician attendance error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
