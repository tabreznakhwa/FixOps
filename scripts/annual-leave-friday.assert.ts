import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { countLeaveDays } from '../src/lib/leave'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

assert.equal(
  countLeaveDays('2026-11-05', '2026-11-07', 'annual_leave'),
  3,
  'annual leave must count Friday as an unpaid calendar day',
)
assert.equal(
  countLeaveDays('2026-11-05', '2026-11-07', 'sick_leave'),
  2,
  'paid sick leave must continue to skip Friday',
)
assert.equal(
  countLeaveDays('2026-11-06', '2026-11-06', 'annual_leave'),
  1,
  'Friday-only annual leave must be valid and unpaid',
)
assert.equal(
  countLeaveDays('2026-11-06', '2026-11-06', 'compensation_leave'),
  0,
  'Friday-only compensation leave must remain outside paid leave days',
)

const dashboard = read('src/app/(dashboard)/my-leave/MyLeaveDashboard.tsx')
assert.ok(dashboard.includes('countLeaveDays(form.start_date, form.end_date, form.leave_type)'))

const route = read('src/app/api/leave-applications/route.ts')
assert.ok(route.includes('countLeaveDays(startDate, endDate, leaveType)'))

const migration = read('supabase/migrations/070_count_fridays_in_annual_leave.sql')
for (const marker of [
  "p_leave_type = 'annual_leave' or extract(isodow from day) <> 5",
  "v_request.leave_type = 'annual_leave'",
  'or extract(isodow from day) <> 5',
  "when 'annual_leave' then 'unpaid_leave'",
  "create or replace function public.validate_managed_leave_attendance()",
  "raise exception 'Managed attendance date is not an approved leave day'",
  'v_request.requested_days := cardinality(v_dates)',
  'grant execute on function public.review_leave_application',
]) {
  assert.ok(migration.includes(marker), `Friday annual-leave migration missing: ${marker}`)
}

const hardening = read('supabase/migrations/071_harden_annual_leave_friday.sql')
for (const marker of [
  "request.leave_type = 'annual_leave'",
  'or extract(isodow from requested_day) <> 5',
  'create or replace function public.protect_approved_leave_from_holiday_change()',
  "or application.leave_type = 'annual_leave'",
  'grant execute on function public.process_payroll',
]) {
  assert.ok(hardening.includes(marker), `Friday annual-leave hardening missing: ${marker}`)
}

const employeeUi = read('src/app/(dashboard)/my-leave/MyLeaveDashboard.tsx')
assert.ok(employeeUi.includes('Annual leave counts every calendar day, including Friday.'))
assert.ok(employeeUi.includes("form.leave_type === 'annual_leave'"))
assert.ok(employeeUi.includes('Annual leave includes Fridays.'))

const reviewerUi = read('src/app/(dashboard)/leave-applications/LeaveApplicationsList.tsx')
assert.ok(reviewerUi.includes("application.requested_days === 1 ? 'day' : 'days'"))
assert.ok(reviewerUi.includes('Annual leave includes Friday; other leave types exclude Friday.'))

console.log('annual leave Friday assertions passed')
