import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

const page = read('src/app/(dashboard)/work-orders/[id]/edit/page.tsx')
for (const marker of [
  "if (profile.role === 'technician') notFound()",
  "(admin as any)",
  ".eq('organization_id', profile.organization_id)",
]) {
  assert.ok(page.includes(marker), `work-order edit page is missing: ${marker}`)
}

const action = read('src/app/(dashboard)/work-orders/actions.ts')
for (const marker of [
  ".select('organization_id, full_name, role, status')",
  "profile.status !== 'active'",
  "!['owner', 'admin', 'manager', 'call_center'].includes(profile.role)",
  'Number.isFinite(estimatedAmount)',
  'Number.isFinite(finalAmount)',
  ".eq('organization_id', profile.organization_id)",
  ".eq('employment_status', 'active')",
  ".select('id, full_name')",
  'technicianName = assignee.full_name',
  "(admin as any).from('work_orders').update({",
  ".select('id')",
  "if (!updatedRows?.length) return { error: 'Work order not found' }",
]) {
  assert.ok(action.includes(marker), `work-order edit action is missing: ${marker}`)
}

const detail = read('src/app/(dashboard)/work-orders/[id]/page.tsx')
assert.ok(detail.includes('{!isTechnician && ('), 'technician detail must hide privileged controls')

const form = read('src/app/(dashboard)/work-orders/[id]/edit/EditWorkOrderForm.tsx')
assert.equal(
  form.includes('name="technician_name"'),
  false,
  'work-order edit form must not submit an untrusted technician name',
)

console.log('technician work-order edit assertions passed')
