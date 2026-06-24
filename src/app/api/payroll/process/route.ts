import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface StaffEntry {
  staff_id: string
  normal_overtime: number
  friday_overtime: number
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { month, year, entries = [] } = await request.json() as {
    month: number; year: number; entries: StaffEntry[]
  }
  if (!month || !year) return NextResponse.json({ error: 'Month and year are required' }, { status: 400 })

  const { data: profileRaw } = await supabase.from('users').select('organization_id').eq('id', user.id).single()
  const profile = profileRaw as unknown as { organization_id: string } | null
  if (!profile?.organization_id) return NextResponse.json({ error: 'No organization found' }, { status: 400 })
  const orgId = profile.organization_id

  const admin = createAdminClient()
  const adminDb = admin as any

  const { data: existingRun } = await adminDb
    .from('salary_runs')
    .select('id')
    .eq('organization_id', orgId)
    .eq('salary_month', month)
    .eq('salary_year', year)
    .single()
  if (existingRun) return NextResponse.json({ error: 'Payroll already processed for this month' }, { status: 409 })

  const { data: staffRaw } = await adminDb
    .from('staff')
    .select('*')
    .eq('organization_id', orgId)
    .eq('employment_status', 'active')

  const staff = (staffRaw ?? []) as Array<{
    id: string; basic_salary: number; housing_allowance: number; transport_allowance: number
    food_allowance: number | null; other_allowance: number
    fixed_overtime_monthly: number | null; overtime_eligible: boolean
  }>

  if (staff.length === 0) return NextResponse.json({ error: 'No active staff found' }, { status: 400 })

  const entryMap = new Map(entries.map((e) => [e.staff_id, e]))

  let totalBasic = 0, totalAllowances = 0, totalOvertime = 0, totalNet = 0

  const slips = staff.map((s) => {
    const entry = entryMap.get(s.id)
    const basic = s.basic_salary ?? 0
    const housing = s.housing_allowance ?? 0
    const transport = s.transport_allowance ?? 0
    const food = s.food_allowance ?? 0
    const other = s.other_allowance ?? 0
    const fixedOT = s.fixed_overtime_monthly ?? 0
    const normalOT = entry?.normal_overtime ?? 0
    const fridayOT = entry?.friday_overtime ?? 0

    const totalAllowance = housing + transport + food + other
    const totalOT = fixedOT + normalOT + fridayOT
    const gross = basic + totalAllowance + totalOT
    const net = gross

    totalBasic += basic
    totalAllowances += totalAllowance
    totalOvertime += totalOT
    totalNet += net

    return {
      organization_id: orgId,
      staff_id: s.id,
      basic_salary: basic,
      housing_allowance: housing,
      transport_allowance: transport,
      food_allowance: food,
      other_allowance: other,
      overtime_amount: fixedOT,
      normal_overtime: normalOT,
      friday_overtime: fridayOT,
      gross_salary: gross,
      deductions: 0,
      advance_deduction: 0,
      net_salary: net,
      payment_status: 'pending',
    }
  })

  const { data: runData, error: runError } = await adminDb
    .from('salary_runs')
    .insert({
      organization_id: orgId,
      salary_month: month,
      salary_year: year,
      status: 'draft',
      total_basic: totalBasic,
      total_allowances: totalAllowances,
      total_overtime: totalOvertime,
      total_deductions: 0,
      total_net: totalNet,
      processed_by: user.id,
      processed_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 })

  const slipsWithRun = slips.map((sl) => ({ ...sl, salary_run_id: runData.id }))
  const { error: slipError } = await adminDb.from('salary_slips').insert(slipsWithRun)
  if (slipError) return NextResponse.json({ error: slipError.message }, { status: 500 })

  return NextResponse.json({ success: true, runId: runData.id })
}
