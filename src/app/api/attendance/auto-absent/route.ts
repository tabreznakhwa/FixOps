/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { decideAutoAbsent } from '@/lib/attendance/autoAbsent'
import { kuwaitISODate } from '@/lib/attendance'

/** Written into the note so auto-created rows are identifiable and correctable. */
const AUTO_NOTE = 'Auto-marked absent — no clock-in recorded'

function yesterdayKuwait(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuwait' }))
  now.setDate(now.getDate() - 1)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

async function run(orgId: string, date: string, userId: string | null) {
  const admin = createAdminClient() as any

  const [{ data: staffRaw }, { data: existingRaw }] = await Promise.all([
    admin
      .from('staff')
      .select('id, full_name, joining_date')
      .eq('organization_id', orgId)
      .eq('employment_status', 'active')
      .limit(1000),
    admin
      .from('attendance')
      .select('staff_id, is_public_holiday')
      .eq('organization_id', orgId)
      .eq('date', date)
      .limit(1000),
  ])

  const existing = (existingRaw ?? []) as Array<{ staff_id: string; is_public_holiday: boolean | null }>

  const decision = decideAutoAbsent({
    date,
    today: kuwaitISODate(),
    activeStaff: (staffRaw ?? []) as any,
    alreadyRecorded: existing.map(e => e.staff_id),
    // A holiday is only knowable from someone having flagged it on that date.
    isPublicHoliday: existing.some(e => e.is_public_holiday === true),
  })

  if (decision.skippedReason || decision.toMark.length === 0) {
    return { date, marked: 0, skippedReason: decision.skippedReason, names: [] as string[] }
  }

  const rows = decision.toMark.map(s => ({
    organization_id: orgId,
    staff_id: s.id,
    date,
    status: 'absent',
    hours_worked: 0,
    overtime_hours: 0,
    friday_ot_amount: 0,
    is_public_holiday: false,
    notes: AUTO_NOTE,
    created_by: userId,
  }))

  const { error } = await admin.from('attendance').insert(rows)
  if (error) throw new Error(error.message)

  return {
    date,
    marked: rows.length,
    skippedReason: null,
    names: decision.toMark.map(s => s.full_name),
  }
}

/**
 * Nightly close. Vercel Cron calls this at 00:00 UTC (03:00 Kuwait), by which
 * point the previous working day is genuinely over — staff here clock out as
 * late as 23:30, so an earlier run would mark people who were still working.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient() as any
    const { data: orgs } = await admin.from('organizations').select('id').limit(100)
    const date = yesterdayKuwait()

    const results = []
    for (const org of (orgs ?? []) as Array<{ id: string }>) {
      results.push(await run(org.id, date, null))
    }
    return NextResponse.json({ success: true, results })
  } catch (err) {
    console.error('Auto-absent cron error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}

/** Manual run for a chosen day, so the day can be closed without waiting for the cron. */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabase as any)
      .from('users').select('organization_id, role').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile?.organization_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['owner', 'admin', 'hr', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const date = (body as { date?: string }).date || yesterdayKuwait()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const result = await run(profile.organization_id, date, user.id)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('Auto-absent error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
