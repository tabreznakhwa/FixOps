import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isWorkOrderAssignedToTechnician } from '../src/lib/workOrderAccess'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

assert.equal(isWorkOrderAssignedToTechnician({
  userId: 'user-1',
  staffId: null,
  workOrder: { assigned_to: 'user-1', assigned_staff_id: null },
}), true)
assert.equal(isWorkOrderAssignedToTechnician({
  userId: 'user-1',
  staffId: 'staff-1',
  workOrder: { assigned_to: null, assigned_staff_id: 'staff-1' },
}), true)
assert.equal(isWorkOrderAssignedToTechnician({
  userId: 'user-1',
  staffId: 'staff-2',
  workOrder: { assigned_to: null, assigned_staff_id: 'staff-1' },
}), false)

const access = read('src/lib/workOrderMutationAccess.ts')
for (const marker of [
  "'call_center'",
  "'technician'",
  'export async function authorizeWorkOrderMutation(',
  "const { data: profileRaw } = await admin",
  ".select('organization_id, role, status')",
  "profile.status !== 'active'",
  ".select('organization_id, assigned_to, assigned_staff_id, status')",
  ".eq('organization_id', profile.organization_id)",
  "profile.role === 'technician'",
  ".eq('employment_status', 'active')",
  'isWorkOrderAssignedToTechnician({',
]) {
  assert.ok(access.includes(marker), `mutation access helper is missing: ${marker}`)
}

const route = read('src/app/api/work-orders/[id]/line-items/route.ts')
for (const marker of [
  "from '@/lib/workOrderMutationAccess'",
  ".eq('organization_id', workOrder.organization_id)",
  "const isTechnician = (profileRaw as { role: string } | null)?.role === 'technician'",
  "isTechnician && item_type !== 'part'",
  "resolvedPrice = isTechnician",
  "Technicians cannot edit line items",
  "isTechnician && item.item_type !== 'part'",
  "Technicians may only remove inventory parts",
  "['completed', 'verified', 'invoiced', 'paid', 'cancelled'].includes(workOrder.status)",
]) {
  assert.ok(route.includes(marker), `line-items route is missing: ${marker}`)
}

assert.equal(
  route.match(/await authorizeWorkOrderMutation\(/g)?.length,
  3,
  'POST, PATCH and DELETE must each authorize the work-order mutation',
)
assert.equal(
  route.match(/if \(isAuthorizationResponse\(authorization\)\) return authorization/g)?.length,
  3,
  'POST, PATCH and DELETE must each stop after an authorization failure',
)

const detail = read('src/app/(dashboard)/work-orders/[id]/page.tsx')
assert.ok(
  detail.includes("['completed', 'verified', 'invoiced', 'paid', 'cancelled'].includes(wo.status)"),
  'closed work orders must hide all line-item mutation controls',
)

const component = read('src/app/(dashboard)/work-orders/[id]/WorkOrderParts.tsx')
assert.ok(
  component.includes("(!hidePrices || item.item_type === 'part')"),
  'technician UI must only offer removal for inventory parts',
)

console.log('technician work-order line-item assertions passed')
