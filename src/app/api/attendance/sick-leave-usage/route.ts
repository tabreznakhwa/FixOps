import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  const { data, error } = await (supabase as any)
    .from('attendance')
    .select('id')
    .eq('staff_id', staffId)
    .eq('status', 'sick_leave')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const used = (data ?? []).length
  return NextResponse.json({
    used,
    limit: SICK_LEAVE_ANNUAL_LIMIT,
    remaining: Math.max(0, SICK_LEAVE_ANNUAL_LIMIT - used),
  })
}
