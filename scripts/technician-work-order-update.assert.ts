import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')
const route = read('src/app/api/work-orders/[id]/route.ts')

for (const marker of [
  ".select('organization_id, role, status')",
  "profile.status !== 'active'",
  "['owner', 'admin', 'manager', 'call_center', 'technician']",
  ".select('organization_id, assigned_to, assigned_staff_id, complaint_id, status')",
  ".eq('organization_id', profile.organization_id)",
  "profile.role === 'technician'",
  ".eq('employment_status', 'active')",
  'isWorkOrderAssignedToTechnician({',
  "const TECHNICIAN_FIELDS = new Set(['status', 'notes'])",
  'const allowed = isTechnician ? TECHNICIAN_FIELDS : PRIVILEGED_FIELDS',
  "'assigned_to'",
  "'assigned_staff_id'",
  "'final_amount'",
  "Choose either a system user or a staff member",
  "Assigned user not found",
  "Assigned staff member not found",
  "updates.technician_name = assignee.full_name",
  "'payment_status'",
  'const TECHNICIAN_STATUS_TRANSITIONS: Record<string, Set<string>>',
  "new: new Set(['accepted'])",
  "assigned: new Set(['accepted'])",
  "accepted: new Set(['on_the_way'])",
  "on_the_way: new Set(['work_started'])",
  "allowedNextStatuses?.has(nextStatus)",
  "['invoiced', 'paid', 'cancelled', 'completed', 'verified'].includes(workOrder.status)",
  "!isTechnician && updates.status === 'completed'",
  'Only the assigned technician can mark this work order as completed',
]) {
  assert.ok(route.includes(marker), `work-order PATCH route is missing: ${marker}`)
}

assert.ok(
  route.match(/\.eq\('organization_id', profile\.organization_id\)/g)!.length >= 3,
  'work-order read, update, and complaint sync must remain organization scoped',
)
assert.equal(
  route.includes("const TECHNICIAN_FIELDS = new Set(['status', 'notes', 'assigned_to'])"),
  false,
  'technicians must not be able to assign work orders',
)

const actions = read('src/app/(dashboard)/work-orders/[id]/WorkOrderActions.tsx')
assert.ok(
  actions.includes('isTechnician && technicianCanComplete'),
  'only the assigned technician may see Mark Complete, and only from a valid active-work state',
)
assert.equal(
  actions.includes('(!isTechnician || technicianCanComplete)'),
  false,
  'admin/manager/owner/call_center must no longer have their own Mark Complete action',
)

const dashboard = read('src/components/technician/TechnicianDashboard.tsx')
assert.ok(
  dashboard.includes("fetch(`/api/work-orders/${jobId}`"),
  'technician dashboard status changes must use the guarded work-order API',
)
assert.equal(
  dashboard.includes(".from('work_orders')"),
  false,
  'technician dashboard must not write work_orders directly through PostgREST',
)
assert.ok(
  dashboard.includes("setStatusError(data?.error ?? 'Failed to update job status')"),
  'technician dashboard must display rejected status updates',
)

console.log('technician work-order update assertions passed')
