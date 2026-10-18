import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const route = readFileSync(
  resolve(root, 'src/app/api/work-orders/route.ts'),
  'utf8',
).replace(/\r\n/g, '\n')

for (const marker of [
  ".select('organization_id, role, full_name, status')",
  "profile.status !== 'active'",
  "!['owner', 'admin', 'manager', 'call_center', 'technician'].includes(profile.role)",
  'Number.isFinite(parsedEstimatedAmount)',
  'Number.isFinite(parsedEstimatedHours)',
  ".from('customers')",
  ".eq('organization_id', profile.organization_id)",
  ".from('complaints')",
  "complaint.customer_id !== customer_id",
  "const isTechnician = profile.role === 'technician'",
  'const parsedEstimatedAmountForInsert = isTechnician ? null : parsedEstimatedAmount',
  'let resolvedAssignedTo = isTechnician ? user.id',
  'let resolvedAssignedStaffId = isTechnician ? null',
  ".from('users')",
  ".eq('status', 'active')",
  ".from('staff')",
  ".eq('employment_status', 'active')",
  'assigned_to: resolvedAssignedTo',
  'assigned_staff_id: resolvedAssignedStaffId',
  'let resolvedTechnicianName = isTechnician ? profile.full_name : null',
  'final_amount: parsedEstimatedAmountForInsert ?? 0',
]) {
  assert.ok(route.includes(marker), `work-order create route is missing: ${marker}`)
}

console.log('technician work-order create assertions passed')
