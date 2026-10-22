import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  AdvanceRecoveryValidationError,
  calcLeaveSettlement,
  parseAdvanceRecoveryAmount,
  type SettlementStaff,
} from '../src/lib/payroll/leaveSettlement'
import { buildStaffAdvanceLedger, type StaffAdvanceEvent } from '../src/app/(dashboard)/staff/ledger/staffLedger'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

const staff: SettlementStaff = {
  basic_salary: 300,
  housing_allowance: 0,
  transport_allowance: 0,
  other_allowance: 0,
  food_allowance: 0,
  fixed_overtime_monthly: 0,
  overtime_eligible: false,
  advance_balance: 40,
}
const calculate = (recovery?: number) => calcLeaveSettlement(
  staff,
  [],
  '2026-10-01',
  '2026-10-10',
  '2026-10-10',
  recovery,
)

const defaultRecovery = calculate()
assert.equal(defaultRecovery.earnedBeforeRecovery, 100)
assert.equal(defaultRecovery.outstandingAdvance, 40)
assert.equal(defaultRecovery.advanceRecovery, 40)
assert.equal(defaultRecovery.advanceRecoveryOverridden, false)
assert.equal(defaultRecovery.unrecoveredAdvance, 0)
assert.equal(defaultRecovery.netPayable, 60)

const zeroRecovery = calculate(0)
assert.equal(zeroRecovery.advanceRecovery, 0)
assert.equal(zeroRecovery.advanceRecoveryOverridden, true)
assert.equal(zeroRecovery.unrecoveredAdvance, 40)
assert.equal(zeroRecovery.netPayable, 100)
assert.ok(zeroRecovery.warnings.some(message => message.includes('40.000 remains carried forward')))

const partialRecovery = calculate(12.345)
assert.equal(partialRecovery.advanceRecovery, 12.345)
assert.equal(partialRecovery.unrecoveredAdvance, 27.655)
assert.equal(partialRecovery.netPayable, 87.655)

const fullRecovery = calculate(40)
assert.equal(fullRecovery.netPayable, defaultRecovery.netPayable)
assert.equal(fullRecovery.advanceRecoveryOverridden, true)

const exactZeroStaff = { ...staff, advance_balance: 100 }
const exactZero = calcLeaveSettlement(exactZeroStaff, [], '2026-10-01', '2026-10-10', '2026-10-10', 100)
assert.equal(exactZero.netPayable, 0)

const excessiveBalanceStaff = { ...staff, advance_balance: 120 }
const defaultFloor = calcLeaveSettlement(excessiveBalanceStaff, [], '2026-10-01', '2026-10-10', '2026-10-10')
assert.equal(defaultFloor.netPayable, 0)
assert.ok(defaultFloor.warnings.some(message => message.includes('nothing is payable now')))

for (const invalid of ['', 'abc', '1.0000', '-1', -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  const parsed = parseAdvanceRecoveryAmount(invalid)
  assert.equal(parsed.success, false, `must reject ${String(invalid)}`)
}
assert.deepEqual(parseAdvanceRecoveryAmount('12.345'), { success: true, value: 12.345 })

function expectRecoveryError(value: number, message: string, customStaff = staff): void {
  assert.throws(
    () => calcLeaveSettlement(customStaff, [], '2026-10-01', '2026-10-10', '2026-10-10', value),
    (error: unknown) => error instanceof AdvanceRecoveryValidationError && error.message === message,
  )
}
expectRecoveryError(40.001, 'Advance recovery cannot exceed the existing advance balance')
expectRecoveryError(100.001, 'Advance recovery cannot exceed the existing advance balance')
expectRecoveryError(100.001, 'Advance recovery cannot exceed the amount earned for this settlement', {
  ...staff,
  advance_balance: 150,
})

const annualLeave = calcLeaveSettlement(
  { ...staff, basic_salary: 900, food_allowance: 90, advance_balance: 0 },
  [
    { date: '2026-10-01', status: 'unpaid_leave', isApprovedAnnualLeave: true, overtime_hours: 0, friday_ot_amount: 0 },
    { date: '2026-10-02', status: 'absent', isApprovedAnnualLeave: false, overtime_hours: 0, friday_ot_amount: 0 },
  ],
  '2026-10-01',
  '2026-10-02',
  '2026-10-02',
)
assert.equal(annualLeave.annualLeaveDeduction, 33)
assert.equal(annualLeave.absentDeduction, 30)

const page = read('src/app/(dashboard)/payroll/leave-settlement/page.tsx')
assert.ok(page.includes("canEditAdvanceRecovery={['owner', 'admin'].includes(profile.role)}"))

const form = read('src/app/(dashboard)/payroll/leave-settlement/LeaveSettlementForm.tsx')
for (const marker of [
  'canEditAdvanceRecovery',
  'advance_recovery_amount: advanceRecovery',
  'expected_advance_balance: preview.outstandingAdvance',
  'expected_net_payable: preview.netPayable',
  'Existing advance recovered',
  'Recalculate',
  'previewStale',
  'Advance carried to month-end',
]) assert.ok(form.includes(marker), `form missing ${marker}`)

const route = read('src/app/api/payroll/leave-settlement/route.ts')
for (const marker of [
  "profile.status !== 'active'",
  "hasOwnProperty.call(input, 'advance_recovery_amount')",
  "!['owner', 'admin'].includes(profile.role)",
  "status: 403",
  'expected_advance_balance',
  'expected_net_payable',
  "status: 409",
  'p_recovery_override: recoveryOverride ?? null',
  'await logAudit({',
  "entityType: 'leave_settlement'",
]) assert.ok(route.includes(marker), `route missing ${marker}`)

const migration = read('supabase/migrations/062_leave_settlement_advance_recovery.sql')
for (const pattern of [
  /drop function if exists public\.settle_leave_salary\(uuid, uuid, uuid, date, numeric, numeric, text, text\)/i,
  /drop function if exists public\.settle_leave_salary\(uuid, uuid, uuid, date, numeric, numeric, numeric, text, text\)/i,
  /p_recovery_override numeric/i,
  /settlement_recovery_amount/i,
  /settlement_recovery_overridden/i,
  /v_actor_role not in \('owner', 'admin'\)/i,
  /v_before \+ round\(p_amount, 3\)/i,
  /grant execute on function public\.settle_leave_salary\([\s\S]*?to service_role/i,
]) assert.match(migration, pattern)
assert.equal(
  /grant execute on function public\.settle_leave_salary\([\s\S]*?to authenticated/i.test(migration),
  false,
)

const startingBalance = 40
const earned = 100
const recoveredToday = 25
const payout = earned - recoveredToday
const canonicalAfterSettlement = startingBalance + payout
const ledgerEvents: StaffAdvanceEvent[] = [
  {
    source: 'advance_issue', sourceId: 'settlement', date: '2026-10-10',
    description: 'Leave settlement', type: 'advance', debit: payout, credit: 0,
  },
  {
    source: 'salary_recovery', sourceId: 'payroll', date: '2026-10-31',
    description: 'Salary recovery', type: 'recovery', debit: 0, credit: canonicalAfterSettlement,
  },
]
const ledger = buildStaffAdvanceLedger(ledgerEvents, { openingAdvance: startingBalance, openingLoan: 0 })
assert.equal(canonicalAfterSettlement, 115)
assert.equal(ledger.rows[0].balance, 115)
assert.equal(ledger.periodClosingBalance, 0)

console.log('leave settlement advance recovery assertions passed')
