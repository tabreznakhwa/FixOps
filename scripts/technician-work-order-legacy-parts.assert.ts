import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const route = readFileSync(
  resolve(root, 'src/app/api/work-orders/[id]/parts/route.ts'),
  'utf8',
).replace(/\r\n/g, '\n')

for (const marker of [
  "from '@/lib/workOrderMutationAccess'",
  'authorizeWorkOrderMutation(',
  'isAuthorizationResponse(authorization)',
  '.eq(\'organization_id\', workOrder.organization_id)',
  'organization_id: workOrder.organization_id',
  ".eq('work_order_id', workOrderId)",
  "['completed', 'verified', 'invoiced', 'paid', 'cancelled'].includes(workOrder.status)",
]) {
  assert.ok(route.includes(marker), `legacy parts route is missing: ${marker}`)
}

assert.equal(
  route.match(/await authorizeWorkOrderMutation\(/g)?.length,
  2,
  'POST and DELETE must each authorize the work-order mutation',
)

console.log('technician legacy work-order parts assertions passed')
