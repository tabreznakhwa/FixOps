import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { calcLeaveSettlement, type SettlementStaff } from '../src/lib/payroll/leaveSettlement'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')
const compact = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase()

function expectPattern(text: string, pattern: RegExp, marker: string): void {
  assert.match(text, pattern, `missing ${marker}`)
}

function expectAll(path: string, markers: Array<string | RegExp>): string {
  const source = read(path)
  for (const marker of markers) {
    if (typeof marker === 'string') {
      assert.ok(source.includes(marker), `${path} is missing marker: ${marker}`)
    } else {
      expectPattern(source, marker, `${path} marker ${marker}`)
    }
  }
  return source
}

const staff: SettlementStaff = {
  basic_salary: 1000,
  housing_allowance: 101,
  transport_allowance: 52,
  other_allowance: 3,
  food_allowance: 77,
  fixed_overtime_monthly: 89,
  overtime_eligible: true,
  advance_balance: 0,
}

const summer = calcLeaveSettlement(
  staff,
  [
    { date: '2026-07-01', status: 'unpaid_leave', isApprovedAnnualLeave: true, overtime_hours: 0, friday_ot_amount: 0 },
    { date: '2026-07-02', status: 'absent', isApprovedAnnualLeave: false, overtime_hours: 0, friday_ot_amount: 0 },
    { date: '2026-07-03', status: 'half_day', isApprovedAnnualLeave: false, overtime_hours: 0, friday_ot_amount: 0 },
    { date: '2026-07-04', status: 'unpaid_leave', isApprovedAnnualLeave: true, overtime_hours: 0, friday_ot_amount: 0 },
    { date: '2026-07-05', status: 'sick_leave', isApprovedAnnualLeave: false, overtime_hours: 0, friday_ot_amount: 0 },
    { date: '2026-07-06', status: 'leave', isApprovedAnnualLeave: false, overtime_hours: 0, friday_ot_amount: 0 },
  ],
  '2026-07-01',
  '2026-07-06',
  '2026-07-06',
)
const summerFixedOt = 89
const expectedAnnualLeave = Math.round((((1000 + 101 + 52 + 3 + 77 + summerFixedOt) / 30) * 2) * 1000) / 1000
const expectedAbsence = ((1000 + 101 + 52 + 3 + summerFixedOt) / 30) * 1.5

assert.equal(summer.annualLeaveDays, 2, 'unpaid annual leave must be counted separately')
assert.equal(summer.absentDays, 1.5, 'annual leave must not increment absent days')
assert.equal(summer.annualLeaveDeduction, expectedAnnualLeave, 'annual leave must include food and seasonal fixed OT and round to 3 decimals')
assert.equal(summer.annualLeaveDeduction, 88.133, 'test fixture must exercise 3-decimal rounding')
assert.equal(summer.absentDeduction, expectedAbsence, 'ordinary absence must exclude food and remain separate')
assert.equal(summer.absentDeduction, 62.25)

const winter = calcLeaveSettlement(
  staff,
  [{ date: '2026-10-01', status: 'unpaid_leave', isApprovedAnnualLeave: true, overtime_hours: 0, friday_ot_amount: 0 }],
  '2026-10-01',
  '2026-10-01',
  '2026-10-01',
)
assert.equal(winter.fixedOtEarned, 0, 'winter must not earn fixed OT')
assert.equal(winter.annualLeaveDays, 1)
assert.equal(winter.absentDays, 0, 'winter annual leave must not become ordinary absence')
assert.equal(winter.annualLeaveDeduction, 41.1, 'winter annual leave must exclude fixed OT but include food')

const orphanUnpaid = calcLeaveSettlement(
  staff,
  [{ date: '2026-10-01', status: 'unpaid_leave', isApprovedAnnualLeave: false, overtime_hours: 0, friday_ot_amount: 0 }],
  '2026-10-01',
  '2026-10-01',
  '2026-10-01',
)
assert.equal(orphanUnpaid.annualLeaveDays, 0, 'unlinked unpaid status must not become approved annual leave')
assert.equal(orphanUnpaid.annualLeaveDeduction, 0)

const migrationPath = 'supabase/migrations/056_unpaid_annual_leave_payroll.sql'
const migration = read(migrationPath)

expectPattern(migration, /add\s+column\s+if\s+not\s+exists\s+annual_leave_paid_snapshot\s+boolean\s+default\s+false[\s\S]*?alter\s+column\s+annual_leave_paid_snapshot\s+set\s+default\s+false[\s\S]*?alter\s+column\s+annual_leave_paid_snapshot\s+set\s+not\s+null/i, 'resumable annual-leave paid snapshot marker')
expectPattern(migration, /check\s*\(\s*status\s+in\s*\([\s\S]*?'unpaid_leave'[\s\S]*?\)\s*\)/i, 'attendance unpaid_leave status constraint')
expectPattern(migration, /add\s+column\s+if\s+not\s+exists\s+annual_leave_days\s+numeric\s*\(\s*6\s*,\s*2\s*\)[\s\S]*?add\s+column\s+if\s+not\s+exists\s+annual_leave_deduction\s+numeric\s*\(\s*13\s*,\s*3\s*\)/i, 'salary-slip annual-leave snapshot columns')

const firstBackfill = migration.indexOf('update public.attendance attendance_row')
const resetFunction = migration.indexOf('create or replace function public.reset_payroll_run')
assert.ok(firstBackfill >= 0 && resetFunction > firstBackfill, 'migration must contain a backfill before reset_payroll_run')
const backfillSql = compact(migration.slice(firstBackfill, resetFunction))
for (const marker of [
  "application.status = 'approved'",
  "application.leave_type = 'annual_leave'",
  'join public.salary_slips slip',
  'slip.salary_run_id = run.id',
  'slip.organization_id = run.organization_id',
  'slip.staff_id = attendance_row.staff_id',
  "set status = 'unpaid_leave'",
  'annual_leave_paid_snapshot = true',
]) {
  assert.ok(backfillSql.includes(marker), `historical backfill is missing: ${marker}`)
}
assert.ok(backfillSql.includes('not exists ( select 1 from public.salary_runs run join public.salary_slips slip'), 'unprocessed backfill must be based on absence of a matching employee salary slip')
assert.ok(backfillSql.includes('exists ( select 1 from public.salary_runs run join public.salary_slips slip'), 'paid snapshot backfill must require a matching employee salary slip')

const processStart = migration.indexOf('create or replace function public.process_payroll')
assert.ok(processStart >= 0 && resetFunction > processStart, 'migration must define process_payroll before reset_payroll_run')
const payrollSql = compact(migration.slice(processStart, resetFunction))
for (const marker of [
  "attendance_row.status = 'unpaid_leave'",
  'where application.id = attendance_row.leave_application_id',
  'application.organization_id = attendance_row.organization_id',
  'application.staff_id = attendance_row.staff_id',
  "application.status = 'approved'",
  "application.leave_type = 'annual_leave'",
]) {
  assert.ok(payrollSql.includes(marker), `payroll annual-leave count is missing approved-link guard: ${marker}`)
}
expectPattern(migration.slice(processStart, resetFunction), /v_annual_leave_deduction\s*:=\s*round\s*\(\s*case[\s\S]*?\(\(v_basic\s*\+\s*v_allowance\s*\+\s*v_food\s*\+\s*v_fixed_ot\)\s*\/\s*30\)[\s\S]*?v_annual_leave_days[\s\S]*?,\s*3\s*\)/i, 'three-decimal payroll formula including food and applicable fixed OT')
expectPattern(migration.slice(processStart, resetFunction), /v_absent_deduction\s*:=\s*round\s*\(\s*case[\s\S]*?\(\(v_basic\s*\+\s*v_allowance\s*\+\s*v_fixed_ot\)\s*\/\s*30\)[\s\S]*?v_absent_days[\s\S]*?,\s*2\s*\)/i, 'separate ordinary-absence formula excluding food')
expectPattern(migration.slice(processStart, resetFunction), /v_fixed_ot\s*:=\s*case\s+when\s+p_month\s+between\s+3\s+and\s+9\s+and\s+coalesce\s*\(\s*v_staff\.overtime_eligible\s*,\s*false\s*\)/i, 'seasonal fixed-OT gate')
expectPattern(migration.slice(processStart, resetFunction), /set_config\s*\(\s*'fixops\.payroll_write_mode'\s*,\s*'process'\s*,\s*true\s*\)/i, 'process-only payroll snapshot write mode')

const resetSql = compact(migration.slice(resetFunction))
for (const marker of [
  "v_run.status = 'paid'",
  "payment_status = 'paid'",
  'cannot reset a payroll run that has already been paid out',
  "set status = 'unpaid_leave'",
  'annual_leave_paid_snapshot = false',
  "application.status = 'approved'",
  "application.leave_type = 'annual_leave'",
  'attendance_row.annual_leave_paid_snapshot',
  'slip.organization_id = p_org_id',
  'slip.salary_run_id = p_run_id',
  'slip.staff_id = attendance_row.staff_id',
]) {
  assert.ok(resetSql.includes(marker), `payroll reset is missing guard/conversion marker: ${marker}`)
}

const gucRestore = /v_previous_bypass\s*:=\s*coalesce\s*\(\s*current_setting\s*\(\s*'fixops\.allow_leave_attendance_write'\s*,\s*true\s*\)[\s\S]*?perform\s+set_config\s*\(\s*'fixops\.allow_leave_attendance_write'\s*,\s*'true'\s*,\s*true\s*\)[\s\S]*?perform\s+set_config\s*\(\s*'fixops\.allow_leave_attendance_write'\s*,\s*v_previous_bypass\s*,\s*true\s*\)[\s\S]*?exception\s+when\s+others\s+then\s+perform\s+set_config\s*\(\s*'fixops\.allow_leave_attendance_write'\s*,\s*v_previous_bypass\s*,\s*true\s*\)[\s\S]*?raise\s*;/gi
assert.ok((migration.match(gucRestore) ?? []).length >= 2, 'backfill/reset GUC bypass must be restored on success and exception')
expectPattern(resetSql, /set_config\s*\(\s*'fixops\.payroll_write_mode'\s*,\s*'reset'\s*,\s*true\s*\)/i, 'reset-only payroll snapshot write mode')
expectPattern(migration, /create\s+or\s+replace\s+function\s+public\.guard_payroll_snapshot_write\(\)[\s\S]*?salary slip snapshots cannot be changed[\s\S]*?salary run snapshots cannot be changed/i, 'payroll snapshot guard function')
expectPattern(migration, /create\s+trigger\s+salary_slips_guard_snapshot_write[\s\S]*?create\s+trigger\s+salary_runs_guard_snapshot_write/i, 'payroll snapshot guard triggers')
expectPattern(migration, /revoke\s+insert\s*,\s*update\s*,\s*delete\s+on\s+public\.salary_runs\s*,\s*public\.salary_slips\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i, 'direct payroll snapshot DML revocation')

const paySalaryRun = read('supabase/migrations/051_finalize_payroll_consistency.sql')
expectPattern(paySalaryRun, /create\s+or\s+replace\s+function\s+public\.pay_salary_run\([\s\S]*?update\s+public\.salary_slips[\s\S]*?set\s+payment_status\s*=\s*'paid'[\s\S]*?update\s+public\.salary_runs[\s\S]*?set\s+status\s*=\s*'paid'[\s\S]*?grant\s+execute\s+on\s+function\s+public\.pay_salary_run[\s\S]*?to\s+service_role/i, 'pay_salary_run must remain the sanctioned paid transition')
expectAll('src/app/api/payroll/[runId]/pay/route.ts', [
  "admin.rpc('pay_salary_run'",
  'p_org_id: profile.organization_id',
  'p_paid_by: user.id',
])

for (const signature of [
  'review_leave_application(uuid, uuid, uuid, text, text)',
  'process_payroll(uuid, uuid, integer, integer, jsonb)',
  'reset_payroll_run(uuid, uuid, uuid)',
]) {
  expectPattern(migration, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${signature.replace(/[()]/g, '\\$&')}\\s+from\\s+public[\\s\\S]*?from\\s+anon[\\s\\S]*?from\\s+authenticated[\\s\\S]*?grant\\s+execute\\s+on\\s+function\\s+public\\.${signature.replace(/[()]/g, '\\$&')}\\s+to\\s+service_role`, 'i'), `${signature} service-role-only grant`)
}

const attendancePage = expectAll('src/app/(dashboard)/attendance/page.tsx', [
  "unpaid_leave: 'Unpaid Leave'",
  "r.status === 'unpaid_leave'",
])
assert.ok(attendancePage.includes('unpaidLeave:'), 'attendance UI must expose unpaid leave in its summary')

for (const path of [
  'src/app/api/attendance/route.ts',
  'src/app/api/attendance/[id]/route.ts',
]) {
  const source = expectAll(path, [
    "const allowedStatuses = ['present', 'absent', 'half_day', 'leave', 'sick_leave']",
    "status === 'unpaid_leave'",
    'approved annual leave application',
  ])
  const allowedStatusDeclaration = source.match(/const allowedStatuses\s*=\s*\[[^\]]*\]/)?.[0] ?? ''
  assert.ok(!allowedStatusDeclaration.includes('unpaid_leave'), `${path} must not permit manual unpaid_leave writes`)
}

expectAll('src/app/api/payroll/leave-settlement/route.ts', [
  "select('date, status, leave_application_id, overtime_hours, friday_ot_amount, is_public_holiday')",
  ".eq('status', 'approved')",
  ".eq('leave_type', 'annual_leave')",
  'isApprovedAnnualLeave:',
  'calcLeaveSettlement(',
])
expectAll('src/app/(dashboard)/payroll/process/page.tsx', [
  "rec.status === 'unpaid_leave'",
  'annualLeaveDaysMap',
])
expectAll('src/app/(dashboard)/payroll/process/PayrollEntryForm.tsx', [
  'Basic + Allowance + Food + Fixed OT per day',
  'return roundMoney(raw, 3)',
  'const gross = roundMoney(',
  'const net = roundMoney(',
])
expectAll('src/app/(dashboard)/payroll/slips/[runId]/[staffId]/page.tsx', [
  'annual_leave_days',
  'annual_leave_deduction',
  'Unpaid Annual Leave',
])
expectAll('src/app/(dashboard)/payroll/leave-settlement/LeaveSettlementForm.tsx', [
  'annualLeaveDays',
  'annualLeaveDeduction',
  'Unpaid annual leave',
])
expectAll('src/app/(dashboard)/user-guide/page.tsx', [
  'Annual Leave (unpaid)',
  'Annual Leave becomes unpaid leave',
  'applicable seasonal Fixed OT',
])
expectAll('docs/PROJECT-STATE.md', [
  'Migration 056',
  '(`056_unpaid_annual_leave_payroll.sql`) were manually applied by the user on',
  'production effects have not yet been independently verified',
  'as an explicit paid',
  'snapshot',
  'applicable seasonal fixed OT',
  'Paid runs remain non-resettable',
])

console.log('unpaid annual leave assertions passed')
