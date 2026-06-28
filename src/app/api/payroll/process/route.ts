import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface StaffEntry {
  staff_id: string
  normal_overtime: number
  friday_overtime: number
  advance_deduction: number
  absent_days: number
  food_deduction: number
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
    food_allowance: number | null; other_allowance: number; allowance_name: string | null
    fixed_overtime_monthly: number | null; overtime_eligible: boolean
    advance_balance: number | null
  }>

  if (staff.length === 0) return NextResponse.json({ error: 'No active staff found' }, { status: 400 })

  const entryMap = new Map(entries.map((e) => [e.staff_id, e]))

  let totalBasic = 0, totalAllowances = 0, totalOvertime = 0, totalDeductions = 0, totalNet = 0

  const slips = staff.map((s) => {
    const entry = entryMap.get(s.id)
    const basic = s.basic_salary ?? 0
    // Housing/transport are legacy columns kept at 0; use other_allowance only
    const allowance = (s.housing_allowance ?? 0) + (s.transport_allowance ?? 0) + (s.other_allowance ?? 0)
    const food = s.food_allowance ?? 0
    const fixedOT = s.fixed_overtime_monthly ?? 0
    const allowanceName = s.allowance_name ?? 'Allowance'

    const normalOTHours = entry?.normal_overtime ?? 0
    const fridayOTHours = entry?.friday_overtime ?? 0
    const hourlyRate = basic / 30 / 8
    const normalOT = hourlyRate * 1.25 * normalOTHours
    const fridayOT = hourlyRate * 1.5 * fridayOTHours

    const advDeduct = Math.min(entry?.advance_deduction ?? 0, s.advance_balance ?? 0)

    // Absent day deductions
    const absentDays = entry?.absent_days ?? 0
    const absentDeduction = absentDays > 0
      ? ((basic + allowance + fixedOT) / 30) * absentDays
      : 0
    // Food deduction: use the user-provided value (which the form pre-fills and user can edit)
    const foodDeduction = entry?.food_deduction ?? 0

    const totalAllowance = allowance + food
    const totalOT = fixedOT + normalOT + fridayOT
    const gross = basic + totalAllowance + totalOT
    const totalAbsenceDeduction = absentDeduction + foodDeduction
    const net = gross - advDeduct - totalAbsenceDeduction

    totalBasic += basic
    totalAllowances += totalAllowance
    totalOvertime += totalOT
    totalDeductions += advDeduct + totalAbsenceDeduction
    totalNet += net

    return {
      organization_id: orgId,
      staff_id: s.id,
      basic_salary: basic,
      housing_allowance: 0,
      transport_allowance: 0,
      food_allowance: food,
      other_allowance: s.other_allowance ?? 0,
      allowance_name: allowanceName,
      overtime_amount: fixedOT,
      normal_overtime: normalOT,
      friday_overtime: fridayOT,
      gross_salary: gross,
      absent_days: absentDays,
      absent_deduction: absentDeduction,
      food_deduction: foodDeduction,
      deductions: totalAbsenceDeduction,
      advance_deduction: advDeduct,
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
      total_deductions: totalDeductions,
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

  // Decrement advance_balance for staff who had deductions
  const deductionUpdates = slips.filter((sl) => sl.advance_deduction > 0)
  for (const sl of deductionUpdates) {
    const staffRecord = staff.find((s) => s.id === sl.staff_id)
    if (!staffRecord) continue
    const newBalance = Math.max(0, (staffRecord.advance_balance ?? 0) - sl.advance_deduction)
    await adminDb.from('staff').update({ advance_balance: newBalance }).eq('id', sl.staff_id)
  }

  return NextResponse.json({ success: true, runId: runData.id })
}
