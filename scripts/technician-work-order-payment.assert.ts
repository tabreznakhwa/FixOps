import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  canTechnicianCollectWorkOrderPayment,
  isWorkOrderAssignedToTechnician,
} from '../src/lib/workOrderAccess'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

const directAssignment = { assigned_to: 'user-1', assigned_staff_id: null }
assert.equal(isWorkOrderAssignedToTechnician({
  userId: 'user-1', staffId: null, workOrder: directAssignment,
}), true)
assert.equal(canTechnicianCollectWorkOrderPayment({
  paymentMode: 'cash', userId: 'user-1', staffId: null, workOrder: directAssignment,
}), true)
assert.equal(canTechnicianCollectWorkOrderPayment({
  paymentMode: 'bank_transfer', userId: 'user-1', staffId: null, workOrder: directAssignment,
}), false)

const staffAssignment = { assigned_to: null, assigned_staff_id: 'staff-1' }
assert.equal(isWorkOrderAssignedToTechnician({
  userId: 'user-1', staffId: 'staff-1', workOrder: staffAssignment,
}), true)
assert.equal(isWorkOrderAssignedToTechnician({
  userId: 'user-1', staffId: 'staff-2', workOrder: staffAssignment,
}), false)
assert.equal(canTechnicianCollectWorkOrderPayment({
  paymentMode: 'cash', userId: 'user-1', staffId: 'staff-1', workOrder: staffAssignment,
}), true)
assert.equal(canTechnicianCollectWorkOrderPayment({
  paymentMode: 'cash', userId: 'user-1', staffId: 'staff-2', workOrder: staffAssignment,
}), false)
assert.equal(canTechnicianCollectWorkOrderPayment({
  paymentMode: 'cash', userId: 'user-1', staffId: null, workOrder: staffAssignment,
}), false)

const migration = read('supabase/migrations/057_technician_work_order_cash_collection.sql')
for (const marker of [
  "v_actor_role = 'technician'",
  "p_payment_mode is distinct from 'cash'",
  'p_work_order_id is null',
  'v_work_order.assigned_to is distinct from p_actor_id',
  's.id = v_work_order.assigned_staff_id',
  's.organization_id = p_org_id',
  's.user_id = p_actor_id',
  "s.employment_status = 'active'",
  "p_org_id, p_actor_id, array['owner', 'admin', 'manager', 'accounts']",
  'to service_role;',
]) {
  assert.ok(migration.includes(marker), `migration is missing: ${marker}`)
}

const paymentSnapshotMigration = read('supabase/migrations/059_work_order_payment_snapshot.sql')
for (const marker of [
  'elsif v_work_order_id is not null then',
  'p.work_order_id = v_work_order_id',
  'p.invoice_id is null',
  'p.is_cancelled = false',
  "when final_amount > 0 and v_total_paid >= final_amount then 'paid'::public.payment_status",
  "else 'partial'::public.payment_status",
  'to service_role;',
]) {
  assert.ok(paymentSnapshotMigration.includes(marker), `payment snapshot migration is missing: ${marker}`)
}

const paymentLimitMigration = read('supabase/migrations/060_work_order_payment_limit.sql')
for (const marker of [
  "coalesce(v_work_order.final_amount, 0) <= 0",
  "raise exception 'Set a positive work order total before collecting payment'",
  'v_total_paid + p_amount_received > v_work_order.final_amount',
  "raise exception 'Payment exceeds the work order amount'",
  "when v_total_paid = final_amount then 'paid'::public.payment_status",
  'to service_role;',
]) {
  assert.ok(paymentLimitMigration.includes(marker), `payment limit migration is missing: ${marker}`)
}

const route = read('src/app/api/work-orders/[id]/collect-payment/route.ts')
for (const marker of [
  "const { data: profileRaw } = await admin",
  "profile.role === 'technician'",
  'canTechnicianCollectWorkOrderPayment({',
  'paymentMode: payment_mode',
  'staffId: ownStaff?.id ?? null',
  ".eq('organization_id', profile.organization_id)",
  ".eq('employment_status', 'active')",
  "workOrder.payment_status === 'paid'",
  ".neq('status', 'cancelled')",
  "invoice?.status === 'paid'",
  "!['issued', 'partial', 'overdue'].includes(invoice.status)",
  'Number.isFinite(parsedAmount)',
  ".from('payments')",
  ".eq('work_order_id', workOrderId)",
  ".is('invoice_id', null)",
  "Number(workOrder.final_amount) <= 0",
  "Set a positive work order total before collecting payment",
  'amountAlreadyCollected + parsedAmount > Number(workOrder.final_amount)',
]) {
  assert.ok(route.includes(marker), `route is missing: ${marker}`)
}

const actions = read('src/app/(dashboard)/work-orders/[id]/WorkOrderActions.tsx')
for (const marker of [
  "payment_mode: isTechnician ? 'cash' : payMode",
  'finalAmount: number | null',
  'finalAmount !== null && finalAmount > 0',
  '{!isTechnician && !isCancelled && (',
  '{!isTechnician && !isCompleted && !isCancelled && (',
]) {
  assert.ok(actions.includes(marker), `work-order actions are missing: ${marker}`)
}

const detail = read('src/app/(dashboard)/work-orders/[id]/page.tsx')
for (const marker of [
  "isTechnician\n          ? 'id, item_type, description, quantity, inventory_item_id'",
  'unit_price: isTechnician ? 0 : Number(item.unit_price) || 0',
  'finalAmount={isTechnician ? null : wo.final_amount}',
]) {
  assert.ok(detail.includes(marker), `technician financial redaction is missing: ${marker}`)
}

console.log('technician work-order payment assertions passed')
