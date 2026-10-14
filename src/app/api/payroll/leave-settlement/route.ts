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
    const [settlementYear, settlementMonth, settlementDay] = settlement_date.split('-').map(Number)
    const parsedSettlementDate = new Date(Date.UTC(settlementYear, settlementMonth - 1, settlementDay))
    if (parsedSettlementDate.getUTCFullYear() !== settlementYear
      || parsedSettlementDate.getUTCMonth() !== settlementMonth - 1
      || parsedSettlementDate.getUTCDate() !== settlementDay) {
      return NextResponse.json({ error: 'A valid settlement date is required' }, { status: 400 })
    }
    const allowedPaymentMethods = ['cash', 'bank_transfer', 'cheque']
    if (payment_method !== undefined && !allowedPaymentMethods.includes(payment_method)) {
      return NextResponse.json({ error: 'Select a valid payment method' }, { status: 400 })
    }
    if (notes !== undefined && (typeof notes !== 'string' || notes.trim().length > 1000)) {
      return NextResponse.json({ error: 'Notes cannot exceed 1,000 characters' }, { status: 400 })
    }

    // The hand-maintained Database type lacks generated relationship metadata,
    // so Supabase cannot infer all migrated tables and RPC arguments.
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
    const [year, month] = [settlementYear, settlementMonth]
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
      .eq('organization_id', profile.organization_id)
      .eq('staff_id', staff_id)
      .gte('date', monthStart)
      .lte('date', settlement_date)

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

    // The RPC rechecks the payroll run under the organization/month lock, then
    // records the advance and updates the balance in one transaction.
    const settlementNotes = notes?.trim()
      || `Leave settlement to ${settlement_date} (${result.daysCovered} days)`
    const { data: settlementRows, error: settlementError } = await admin.rpc('settle_leave_salary', {
      p_org_id: profile.organization_id,
      p_paid_by: user.id,
      p_staff_id: staff_id,
      p_settlement_date: settlement_date,
      p_amount: result.netPayable,
      p_expected_balance: result.outstandingAdvance,
      p_payment_method: payment_method ?? 'cash',
      p_notes: settlementNotes,
    })
    if (settlementError) {
      const message = settlementError.message?.replace(/^Error:\s*/, '') ?? ''
      if (message.includes('Payroll for this month has already been processed')
        || message.includes('advance balance changed')) {
        return NextResponse.json({ error: message }, { status: 409 })
      }
      console.error('Leave settlement RPC error:', settlementError)
      return NextResponse.json({ error: 'Unable to record leave settlement' }, { status: 500 })
    }

    const settlement = Array.isArray(settlementRows) ? settlementRows[0] : settlementRows
    return NextResponse.json({
      success: true,
      staffName: staff.full_name,
      ...result,
      advance_balance: settlement?.balance_after,
    })
  } catch (err) {
    console.error('Leave settlement error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to process settlement'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
