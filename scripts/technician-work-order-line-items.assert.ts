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
  "const isTechnician = workOrder.actorRole === 'technician'",
  'let resolvedPrice = Number(unit_price)',
  '? Number(unit_price)',
  "select('current_stock, unit_of_measure, purchase_price')",
  'unitCost = Number(invItem.purchase_price) || 0',
  "select('purchase_price')",
  "['completed', 'verified', 'invoiced', 'paid', 'cancelled'].includes(workOrder.status)",
  ".update({ final_amount: newTotal, updated_at: new Date().toISOString() })",
]) {
  assert.ok(route.includes(marker), `line-items route is missing: ${marker}`)
}

for (const removedRestriction of [
  "isTechnician && item_type !== 'part'",
  'Technicians may only add inventory parts',
  'Technicians cannot edit line items',
  "isTechnician && item.item_type !== 'part'",
  'Technicians may only remove inventory parts',
]) {
  assert.equal(
    route.includes(removedRestriction),
    false,
    `line-items route still restricts technician line items: ${removedRestriction}`,
  )
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
assert.equal(
  route.match(/\['completed', 'verified', 'invoiced', 'paid', 'cancelled'\]\.includes\(workOrder\.status\)/g)?.length,
  3,
  'POST, PATCH and DELETE must each reject closed work orders',
)
assert.equal(
  route.match(/\.update\(\{ final_amount: newTotal, updated_at: new Date\(\)\.toISOString\(\) \}\)/g)?.length,
  3,
  'POST, PATCH and DELETE must each recalculate the work-order final amount',
)

const detail = read('src/app/(dashboard)/work-orders/[id]/page.tsx')
for (const marker of [
  "select('id, item_code, item_name, unit_of_measure, current_stock, selling_price')",
  ".select('id, item_type, description, quantity, unit_price, inventory_item_id')",
  'selling_price: Number(item.selling_price) || 0',
  'unit_price: Number(item.unit_price) || 0',
  'paymentAmount={paymentAmount}',
  "['completed', 'verified', 'invoiced', 'paid', 'cancelled'].includes(wo.status)",
]) {
  assert.ok(detail.includes(marker), `work-order detail is missing: ${marker}`)
}
assert.equal(detail.includes('hidePrices={isTechnician}'), false)

const component = read('src/app/(dashboard)/work-orders/[id]/WorkOrderParts.tsx')
for (const marker of [
  "(['custom', 'part', 'service'] as TabType[]).map",
  'const price = parseFloat(unitPrice)',
  'Unit Price (KWD)',
  'Total: KWD {total.toFixed(3)}',
  'onClick={() => startEdit(item)}',
  'onClick={() => handleRemove(item.id)}',
]) {
  assert.ok(component.includes(marker), `line-item component is missing: ${marker}`)
}
assert.equal(component.includes('hidePrices'), false, 'line-item pricing must not be hidden from technicians')

console.log('technician work-order line-item assertions passed')
