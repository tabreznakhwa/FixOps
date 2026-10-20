import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

const page = read('src/app/(dashboard)/work-orders/[id]/edit/page.tsx')
for (const marker of [
  "if (profile.role === 'technician') {",
  "select('id, work_order_number, service_category, job_description, notes, status, assigned_to, assigned_staff_id')",
  ".eq('organization_id', profile.organization_id)",
  ".eq('employment_status', 'active')",
  'isWorkOrderAssignedToTechnician({',
  'hasNonCancelledWorkOrderInvoice(',
  "['invoiced', 'paid', 'cancelled'].includes(wo.status)",
  'const editableWorkOrder = {',
  '<TechnicianEditWorkOrderForm wo={editableWorkOrder} detailHref={detail.href} />',
  '<EditWorkOrderForm wo={wo}',
]) {
  assert.ok(page.includes(marker), `work-order edit page is missing: ${marker}`)
}
assert.equal(
  page.includes("if (profile.role === 'technician') notFound()"),
  false,
  'assigned technicians must no longer be blocked from the edit page',
)

const technicianForm = read('src/app/(dashboard)/work-orders/[id]/edit/TechnicianEditWorkOrderForm.tsx')
for (const marker of [
  "fetch(`/api/work-orders/${wo.id}`",
  "method: 'PATCH'",
  "'Content-Type': 'application/json'",
  'service_category: formData.get(\'service_category\')',
  'job_description: formData.get(\'job_description\')',
  'notes: formData.get(\'notes\')',
  'router.replace(detailHref)',
  'router.refresh()',
  'WORK_ORDER_SERVICE_CATEGORIES.map',
]) {
  assert.ok(technicianForm.includes(marker), `technician edit form is missing: ${marker}`)
}
for (const forbiddenField of [
  'name="priority"',
  'name="assigned_to"',
  'name="assigned_staff_id"',
  'name="assigned_key"',
  'name="scheduled_date"',
  'name="scheduled_time"',
  'name="estimated_hours"',
  'name="estimated_amount"',
  'name="final_amount"',
  'name="payment_status"',
  'name="technician_name"',
]) {
  assert.equal(
    technicianForm.includes(forbiddenField),
    false,
    `technician edit form must not expose ${forbiddenField}`,
  )
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
for (const marker of [
  "const canEditJobDetails = !['invoiced', 'paid', 'cancelled'].includes(wo.status) && !existingInvoice",
  '{(!isTechnician || canEditJobDetails) && (',
  'isCompleted={!canEditLineItems}',
]) {
  assert.ok(detail.includes(marker), `work-order detail is missing: ${marker}`)
}

const form = read('src/app/(dashboard)/work-orders/[id]/edit/EditWorkOrderForm.tsx')
assert.equal(
  form.includes('name="technician_name"'),
  false,
  'work-order edit form must not submit an untrusted technician name',
)
assert.ok(form.includes('WORK_ORDER_SERVICE_CATEGORIES.map'))

console.log('technician work-order edit assertions passed')
