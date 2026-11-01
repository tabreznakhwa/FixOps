import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  canEditPrivilegedWorkOrderDetails,
  canMutateWorkOrderLineItems,
} from '../src/lib/workOrderMutationAccess'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

assert.equal(canEditPrivilegedWorkOrderDetails({
  status: 'completed', actorRole: 'admin', hasFinancialActivity: false,
}), true)
assert.equal(canEditPrivilegedWorkOrderDetails({
  status: 'completed', actorRole: 'owner', hasFinancialActivity: false,
}), true)
for (const actorRole of ['manager', 'call_center']) {
  assert.equal(canEditPrivilegedWorkOrderDetails({
    status: 'completed', actorRole, hasFinancialActivity: false,
  }), true)
}
assert.equal(canEditPrivilegedWorkOrderDetails({
  status: 'completed', actorRole: 'technician', hasFinancialActivity: false,
}), false)
for (const hasFinancialActivity of [false, true]) {
  assert.equal(canEditPrivilegedWorkOrderDetails({
    status: 'invoiced', actorRole: 'admin', hasFinancialActivity,
  }), false)
  assert.equal(canEditPrivilegedWorkOrderDetails({
    status: 'paid', actorRole: 'admin', hasFinancialActivity,
  }), false)
  assert.equal(canEditPrivilegedWorkOrderDetails({
    status: 'cancelled', actorRole: 'admin', hasFinancialActivity,
  }), false)
}
assert.equal(canEditPrivilegedWorkOrderDetails({
  status: 'completed', actorRole: 'admin', hasFinancialActivity: true,
}), true)
assert.equal(canEditPrivilegedWorkOrderDetails({
  status: 'completed', actorRole: 'owner', hasFinancialActivity: true,
}), true)
for (const actorRole of ['manager', 'call_center']) {
  assert.equal(canEditPrivilegedWorkOrderDetails({
    status: 'completed', actorRole, hasFinancialActivity: true,
  }), false)
}
assert.equal(canEditPrivilegedWorkOrderDetails({
  status: 'work_started', actorRole: 'manager', hasFinancialActivity: false,
}), true)
assert.equal(canEditPrivilegedWorkOrderDetails({
  status: 'work_started', actorRole: 'call_center', hasFinancialActivity: false,
}), true)
assert.equal(canEditPrivilegedWorkOrderDetails({
  status: 'work_started', actorRole: 'technician', hasFinancialActivity: false,
}), false)

assert.equal(canMutateWorkOrderLineItems({
  status: 'completed', actorRole: 'admin', hasFinancialActivity: false,
}), true)
assert.equal(canMutateWorkOrderLineItems({
  status: 'completed', actorRole: 'admin', hasFinancialActivity: true,
}), false)

const detailPage = read('src/app/(dashboard)/work-orders/[id]/page.tsx')
for (const marker of [
  'const hasFinancialActivity = Boolean(existingInvoice || directReceipts.length)',
  'const canEditJobDetails = isTechnician',
  ': canEditPrivilegedWorkOrderDetails({',
  'actorRole: profile.role,',
  '{canEditJobDetails && (',
]) {
  assert.ok(detailPage.includes(marker), `work-order detail page is missing: ${marker}`)
}

const editPage = read('src/app/(dashboard)/work-orders/[id]/edit/page.tsx')
for (const marker of [
  'hasWorkOrderFinancialActivity(admin, profile.organization_id, id)',
  'if (!canEditPrivilegedWorkOrderDetails({',
  'status: wo.status,',
  'actorRole: profile.role,',
  'hasFinancialActivity,',
  '})) redirect(detail.href)',
]) {
  assert.ok(editPage.includes(marker), `work-order edit page is missing: ${marker}`)
}

const action = read('src/app/(dashboard)/work-orders/actions.ts')
for (const marker of [
  ".select('status')",
  'const hasFinancialActivity = await hasWorkOrderFinancialActivity(',
  'if (!canEditPrivilegedWorkOrderDetails({',
  'status: workOrder.status,',
  'actorRole: profile.role,',
  "return { error: 'This work order can no longer be edited' }",
  ".eq('organization_id', profile.organization_id)",
]) {
  assert.ok(action.includes(marker), `work-order server action is missing: ${marker}`)
}

const route = read('src/app/api/work-orders/[id]/route.ts')
for (const marker of [
  'if (!isTechnician) {',
  'const hasFinancialActivity = await hasWorkOrderFinancialActivity(',
  'if (!canEditPrivilegedWorkOrderDetails({',
  'status: workOrder.status,',
  'actorRole: workOrder.actorRole,',
  "{ error: 'This work order can no longer be edited' }",
  '{ status: 409 }',
]) {
  assert.ok(route.includes(marker), `work-order PATCH route is missing: ${marker}`)
}
assert.ok(
  route.indexOf('if (!canEditPrivilegedWorkOrderDetails({')
    < route.indexOf(".from('work_orders')\n      .update({ ...updates"),
  'the completed-work-order policy must run before the PATCH update',
)
assert.ok(
  action.indexOf('if (!canEditPrivilegedWorkOrderDetails({')
    < action.indexOf("(admin as any).from('work_orders').update({"),
  'the completed-work-order policy must run before the server-action update',
)

console.log('admin completed work-order edit assertions passed')
