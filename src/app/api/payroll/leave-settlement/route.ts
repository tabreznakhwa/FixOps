/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { calcLeaveSettlement } from '@/lib/payroll/leaveSettlement'

/**
 * Pro-rata settlement for an employee going on leave.
 *
 * `preview: true` costs the settlement without writing anything, so the figure
 * can be shown and checked before any money moves. Without it, the settlement
 * is recorded as a staff advance, which the monthly payroll run then recovers
 * automatically through advance_balance.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabase as any)
      .from('users').select('organization_id, role').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile?.organization_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['owner', 'admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { staff_id, settlement_date, preview, payment_method, notes } = body as {
      staff_id: string
      settlement_date: string
      preview?: boolean
      payment_method?: string
      notes?: string
    }

    if (!staff_id) return NextResponse.json({ error: 'Employee is required' }, { status: 400 })
    if (!settlement_date || !/^\d{4}-\d{2}-\d{2}$/.test(settlement_date)) {
      return NextResponse.json({ error: 'A valid settlement date is required' }, { status: 400 })
    }

    const admin = createAdminClient() as any

    const { data: staff } = await admin
      .from('staff')
      .select('id, full_name, organization_id, basic_salary, housing_allowance, transport_allowance, other_allowance, food_allowance, fixed_overtime_monthly, overtime_eligible, advance_balance, employment_status')
      .eq('id', staff_id)
      .single()

    if (!staff || staff.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const monthStart = `${settlement_date.slice(0, 7)}-01`
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })

    // Refuse to settle a month that has already been run — the salary would be
    // paid twice, once here and once by the completed monthly run.
    const [year, month] = [Number(settlement_date.slice(0, 4)), Number(settlement_date.slice(5, 7))]
    const { data: existingRun } = await admin
      .from('salary_runs')
      .select('id, status')
      .eq('organization_id', profile.organization_id)
      .eq('salary_month', month)
      .eq('salary_year', year)
      .maybeSingle()

    if (existingRun) {
      return NextResponse.json({
        error: 'Payroll for this month has already been processed. Settle from that run instead.',
      }, { status: 409 })
    }

    const { data: attendanceRaw } = await admin
      .from('attendance')
      .select('date, status, overtime_hours, friday_ot_amount, is_public_holiday')
      .eq('staff_id', staff_id)
      .gte('date', monthStart)
      .lte('date', settlement_date)
      .limit(200)

    const result = calcLeaveSettlement(
      staff,
      attendanceRaw ?? [],
      monthStart,
      settlement_date,
      today
    )

    if (preview) {
      return NextResponse.json({
        success: true,
        preview: true,
        staffName: staff.full_name,
        ...result,
      })
    }

    if (result.netPayable <= 0) {
      return NextResponse.json({
        error: 'Nothing is payable for this period once the outstanding advance is applied.',
      }, { status: 400 })
    }

    // Recorded as an advance so the monthly run recovers it automatically.
    const { error: insertError } = await admin.from('staff_advances').insert({
      organization_id: profile.organization_id,
      staff_id,
      type: 'advance',
      amount: result.netPayable,
      issued_date: today,
      payment_method: payment_method ?? 'cash',
      notes: notes?.trim()
        || `Leave settlement to ${settlement_date} (${result.daysCovered} days)`,
      created_by: user.id,
    })
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

    const newBalance = (Number(staff.advance_balance) || 0) + result.netPayable
    const { error: updateError } = await admin
      .from('staff').update({ advance_balance: newBalance }).eq('id', staff_id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      staffName: staff.full_name,
      ...result,
      advance_balance: newBalance,
    })
  } catch (err) {
    console.error('Leave settlement error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to process settlement'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
