import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

const route = read('src/app/api/staff/[id]/route.ts')
for (const status of ['active', 'on_leave', 'terminated', 'resigned']) {
  assert.ok(route.includes(`'${status}'`), `staff route is missing employment status: ${status}`)
}
assert.ok(route.includes("return NextResponse.json({ error: 'Invalid employment status' }, { status: 400 })"))
assert.ok(route.indexOf('Invalid employment status') < route.indexOf("admin.rpc('update_staff_profile_with_opening_balance'"))

const migration = read('supabase/migrations/064_staff_employment_status_enum.sql')
for (const marker of [
  'create or replace function public.update_staff_profile_with_opening_balance(',
  'v_employment_status := p_updates->>\'employment_status\';',
  "v_employment_status not in (\n    'active', 'on_leave', 'terminated', 'resigned'\n  )",
  "raise exception 'Invalid employment status';",
  'employment_status = v_employment_status::public.employment_status,',
  'for update;',
  'The employee opening balance changed. Reload and try again.',
  'advance_balance = v_balance,',
  'to service_role;',
]) {
  assert.ok(migration.includes(marker), `staff status migration is missing: ${marker}`)
}
assert.equal(migration.includes("employment_status = p_updates->>'employment_status'"), false)

console.log('staff profile assertions passed')
