import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')
const compact = (value: string) => value.replace(/\s+/g, ' ').trim()

const form = read('src/app/(dashboard)/payroll/process/PayrollEntryForm.tsx')
for (const marker of [
  'function parseManualDeduction(value: string, decimals = 2)',
  "advance_deduction: parseManualDeduction(entries[s.id]?.advance_deduction || '0', 3)",
  "const advDeduct = parseManualDeduction(entries[s.id]?.advance_deduction || '0', 3)",
  'type="number" min="0" step="0.001" placeholder="0.000"',
]) {
  assert.ok(form.includes(marker), `payroll form is missing: ${marker}`)
}

const migration = read('supabase/migrations/065_payroll_advance_precision.sql')
const sql = compact(migration)
for (const marker of [
  'alter column advance_deduction type numeric(13,3)',
  'create or replace function public.process_payroll(',
  "attendance_row.status = 'unpaid_leave'",
  "application.leave_type = 'annual_leave'",
  "perform set_config('fixops.payroll_write_mode', 'process', true)",
  'grant execute on function public.process_payroll(uuid, uuid, integer, integer, jsonb) to service_role;',
]) {
  assert.ok(sql.includes(marker), `payroll precision migration is missing: ${marker}`)
}
assert.match(
  migration,
  /v_requested_advance_deduction\s*:=\s*round\s*\(\s*\(v_entry->>'advance_deduction'\)::numeric\s*,\s*3\s*\)/,
  'advance recovery must preserve three-decimal KWD precision',
)
assert.match(
  migration,
  /if\s+v_requested_advance_deduction\s*>\s*greatest\s*\([\s\S]*?advance_balance[\s\S]*?\)\s*then/,
  'advance recovery must be checked against the locked balance',
)
assert.equal(
  /advance_balance[\s\S]*?\)\s*\+\s*0\.001\s*then/.test(migration),
  false,
  'the balance guard must not permit an over-deduction tolerance',
)

assert.equal(Math.round(250.146 * 100) / 100, 250.15)
assert.equal(Math.round(250.146 * 1000) / 1000, 250.146)
assert.ok(250.15 > 250.146 + 0.001)

console.log('payroll advance precision assertions passed')
