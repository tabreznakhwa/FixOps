import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

const SICK_LEAVE_ANNUAL_LIMIT = 15

/**
 * How many sick-leave days a staff member has used in a calendar year.
 * The UI uses this to warn (never block) before marking another sick day.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const staffId = searchParams.get('staff_id')
  const year = searchParams.get('year')

  if (!staffId || !year || !/^\d{4}$/.test(year)) {
    return NextResponse.json({ used: 0, limit: SICK_LEAVE_ANNUAL_LIMIT, remaining: SICK_LEAVE_ANNUAL_LIMIT })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve the requested employee in the caller's organization. Employees may
  // read only their own usage; attendance administrators may read anyone's.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const [{ data: profile }, { data: staff }] = await Promise.all([
    admin.from('users').select('organization_id, role, status').eq('id', user.id).single(),
    admin.from('staff').select('id, organization_id, user_id').eq('id', staffId).maybeSingle(),
  ])

  if (!profile || profile.status !== 'active' || !staff || staff.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  }
  const canReadAny = ['owner', 'admin', 'hr', 'manager'].includes(profile.role)
  if (!canReadAny && staff.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { count, error } = await admin
    .from('attendance')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', profile.organization_id)
    .eq('staff_id', staffId)
    .eq('status', 'sick_leave')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const used = count ?? 0
  return NextResponse.json({
    used,
    limit: SICK_LEAVE_ANNUAL_LIMIT,
    remaining: Math.max(0, SICK_LEAVE_ANNUAL_LIMIT - used),
  })
}
