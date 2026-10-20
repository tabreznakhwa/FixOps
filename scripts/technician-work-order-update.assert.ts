import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')
const route = read('src/app/api/work-orders/[id]/route.ts')

for (const marker of [
  'authorizeWorkOrderMutation(supabase, user.id, id)',
  'if (isAuthorizationResponse(authorization)) return authorization',
  "const TECHNICIAN_FIELDS = new Set(['status', 'notes', 'service_category', 'job_description'])",
  'const allowed = isTechnician ? TECHNICIAN_FIELDS : PRIVILEGED_FIELDS',
  "'assigned_to'",
  "'assigned_staff_id'",
  "'final_amount'",
  'Choose either a system user or a staff member',
  'Assigned user not found',
  'Assigned staff member not found',
  'updates.technician_name = assignee.full_name',
  "'payment_status'",
  'const TECHNICIAN_STATUS_TRANSITIONS: Record<string, Set<string>>',
  "new: new Set(['accepted', 'completed'])",
  "assigned: new Set(['accepted', 'completed'])",
  "accepted: new Set(['on_the_way', 'completed'])",
  "on_the_way: new Set(['work_started', 'completed'])",
  'allowedNextStatuses?.has(nextStatus)',
  "['invoiced', 'paid', 'cancelled'].includes(workOrder.status)",
  'hasNonCancelledWorkOrderInvoice(',
  'An invoice has already been generated for this work order',
  'isWorkOrderServiceCategory(category)',
  'Job description is required',
  'Invalid notes',
  "!isTechnician && updates.status === 'completed'",
  'Only the assigned technician can mark this work order as completed',
  ".eq('organization_id', workOrder.organization_id)",
]) {
  assert.ok(route.includes(marker), `work-order PATCH route is missing: ${marker}`)
}

for (const removedMarker of [
  "if (['invoiced', 'paid', 'cancelled', 'completed', 'verified'].includes(workOrder.status))",
  "const TECHNICIAN_FIELDS = new Set(['status', 'notes', 'assigned_to'])",
]) {
  assert.equal(route.includes(removedMarker), false, `work-order PATCH route still contains: ${removedMarker}`)
}

const access = read('src/lib/workOrderMutationAccess.ts')
for (const marker of [
  ".select('organization_id, assigned_to, assigned_staff_id, complaint_id, status')",
  "profile.status !== 'active'",
  "profile.role === 'technician'",
  ".eq('employment_status', 'active')",
  'isWorkOrderAssignedToTechnician({',
]) {
  assert.ok(access.includes(marker), `central work-order authorization is missing: ${marker}`)
}

const categories = read('src/lib/workOrderCategories.ts')
assert.ok(categories.includes('WORK_ORDER_SERVICE_CATEGORIES'))
assert.ok(categories.includes('isWorkOrderServiceCategory'))

const actions = read('src/app/(dashboard)/work-orders/[id]/WorkOrderActions.tsx')
assert.ok(
  actions.includes('isTechnician && technicianCanComplete'),
  'only the assigned technician may see Mark Complete, and only on an active work order',
)
for (const status of [
  "'new'",
  "'assigned'",
  "'accepted'",
  "'on_the_way'",
  "'work_started'",
  "'waiting_parts'",
  "'waiting_approval'",
]) {
  assert.ok(
    actions.includes(status),
    `technician Mark Complete must remain available from active status: ${status}`,
  )
}
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
