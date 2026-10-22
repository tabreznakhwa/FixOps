/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import {
  AdvanceRecoveryValidationError,
  calcLeaveSettlement,
  parseAdvanceRecoveryAmount,
  toKwdFils,
} from '@/lib/payroll/leaveSettlement'
import { logAudit } from '@/lib/audit'

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
      .from('users')
      .select('organization_id, role, full_name, status')
      .eq('id', user.id)
      .single()
    const profile = profileRaw as {
      organization_id: string
      role: string
      full_name: string | null
      status: string
    } | null
    if (!profile?.organization_id || profile.status !== 'active') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!['owner', 'admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body: unknown = await request.json()
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const input = body as Record<string, unknown>
    const hasRecoveryOverride = Object.prototype.hasOwnProperty.call(input, 'advance_recovery_amount')
    if (hasRecoveryOverride && !['owner', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Only an owner or admin can change advance recovery' }, { status: 403 })
    }

    let recoveryOverride: number | undefined
    if (hasRecoveryOverride) {
      const parsedRecovery = parseAdvanceRecoveryAmount(input.advance_recovery_amount)
      if (!parsedRecovery.success) {
        return NextResponse.json({ error: parsedRecovery.error }, { status: 400 })
      }
      recoveryOverride = parsedRecovery.value
    }

    const staff_id = typeof input.staff_id === 'string' ? input.staff_id.trim() : ''
    const settlement_date = typeof input.settlement_date === 'string' ? input.settlement_date : ''
    const preview = input.preview === true
    const payment_method = input.payment_method
    const notes = input.notes

    if (!staff_id) return NextResponse.json({ error: 'Employee is required' }, { status: 400 })
    if (input.preview !== undefined && typeof input.preview !== 'boolean') {
      return NextResponse.json({ error: 'Invalid preview request' }, { status: 400 })
    }
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
    if (payment_method !== undefined
      && (typeof payment_method !== 'string' || !allowedPaymentMethods.includes(payment_method))) {
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

    const { data: attendanceRaw, error: attendanceError } = await admin
      .from('attendance')
      .select('date, status, leave_application_id, overtime_hours, friday_ot_amount, is_public_holiday')
      .eq('organization_id', profile.organization_id)
      .eq('staff_id', staff_id)
      .gte('date', monthStart)
      .lte('date', settlement_date)
    if (attendanceError) {
      console.error('Leave settlement attendance query error:', attendanceError)
      return NextResponse.json({ error: 'Unable to read attendance for this settlement' }, { status: 500 })
    }

    const leaveApplicationIds = Array.from(new Set(
      (attendanceRaw ?? [])
        .map((row: { leave_application_id: string | null }) => row.leave_application_id)
        .filter((id: string | null): id is string => Boolean(id)),
    ))
    const approvedAnnualLeaveIds = new Set<string>()
    if (leaveApplicationIds.length > 0) {
      const { data: approvedApplications, error: applicationsError } = await admin
        .from('leave_applications')
        .select('id')
        .eq('organization_id', profile.organization_id)
        .eq('staff_id', staff_id)
        .eq('status', 'approved')
        .eq('leave_type', 'annual_leave')
        .in('id', leaveApplicationIds)
      if (applicationsError) {
        console.error('Leave settlement application validation error:', applicationsError)
        return NextResponse.json({ error: 'Unable to validate annual leave attendance' }, { status: 500 })
      }
      for (const application of approvedApplications ?? []) {
        approvedAnnualLeaveIds.add(application.id)
      }
    }

    const attendance = (attendanceRaw ?? []).map((row: {
      date: string
      status: string
      leave_application_id: string | null
      overtime_hours: number | null
      friday_ot_amount: number | null
      is_public_holiday: boolean | null
    }) => ({
      date: row.date,
      status: row.status,
      isApprovedAnnualLeave: row.leave_application_id !== null
        && approvedAnnualLeaveIds.has(row.leave_application_id),
      overtime_hours: row.overtime_hours,
      friday_ot_amount: row.friday_ot_amount,
      is_public_holiday: row.is_public_holiday,
    }))

    let result
    try {
      result = calcLeaveSettlement(
        staff,
        attendance,
        monthStart,
        settlement_date,
        today,
        recoveryOverride,
      )
    } catch (error) {
      if (error instanceof AdvanceRecoveryValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      throw error
    }

    if (preview) {
      return NextResponse.json({
        success: true,
        preview: true,
        staffName: staff.full_name,
        ...result,
      })
    }

    const expectedBalanceFils = toKwdFils(input.expected_advance_balance)
    const expectedPayableFils = toKwdFils(input.expected_net_payable)
    if (expectedBalanceFils === null || expectedPayableFils === null) {
      return NextResponse.json({
        error: 'Recalculate the settlement before confirming payment.',
      }, { status: 409 })
    }
    if (expectedBalanceFils !== toKwdFils(result.outstandingAdvance)
      || expectedPayableFils !== toKwdFils(result.netPayable)) {
      return NextResponse.json({
        error: 'The settlement changed. Recalculate it before confirming payment.',
      }, { status: 409 })
    }

    if (result.netPayable <= 0) {
      return NextResponse.json({
        error: 'Nothing is payable for this period once the selected advance recovery is applied.',
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
      p_expected_balance: expectedBalanceFils / 1000,
      p_recovery_override: recoveryOverride ?? null,
      p_payment_method: payment_method ?? 'cash',
      p_notes: settlementNotes,
    })
    if (settlementError) {
      const message = settlementError.message?.replace(/^Error:\s*/, '') ?? ''
      if (message.includes('Payroll for this month has already been processed')
        || message.includes('advance balance changed')) {
        return NextResponse.json({ error: message }, { status: 409 })
      }
      if (message.includes('Only an owner or admin can change advance recovery')
        || message === 'Forbidden') {
        return NextResponse.json({ error: message }, { status: 403 })
      }
      if (message.includes('Advance recovery')
        || message.includes('Invalid leave settlement')
        || message.includes('valid payment method')
        || message.includes('Notes cannot exceed')) {
        return NextResponse.json({ error: message }, { status: 400 })
      }
      console.error('Leave settlement RPC error:', settlementError)
      return NextResponse.json({ error: 'Unable to record leave settlement' }, { status: 500 })
    }

    const settlement = Array.isArray(settlementRows) ? settlementRows[0] : settlementRows
    await logAudit({
      orgId: profile.organization_id,
      userId: user.id,
      userName: profile.full_name ?? undefined,
      action: 'create',
      entityType: 'leave_settlement',
      entityId: settlement?.advance_id,
      entityLabel: staff.full_name,
      changes: {
        staff_id,
        settlement_date,
        payout: result.netPayable,
        existing_advance_balance: result.outstandingAdvance,
        advance_recovery: result.advanceRecovery,
        advance_recovery_overridden: result.advanceRecoveryOverridden,
        unrecovered_advance: result.unrecoveredAdvance,
        payment_method: payment_method ?? 'cash',
      },
    })

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
