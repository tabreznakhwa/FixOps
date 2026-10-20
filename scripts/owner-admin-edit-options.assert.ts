import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

const workOrders = read('src/app/(dashboard)/work-orders/page.tsx')
for (const marker of [
  "const canEdit = ['owner', 'admin'].includes(profile.role)",
  '{canEdit && (',
  'href={withReturnTo(`/work-orders/${wo.id}/edit`, listPath)}',
  '>\n                              Edit\n                            </Link>',
]) {
  assert.ok(workOrders.includes(marker), `work-order list is missing: ${marker}`)
}
assert.equal(
  workOrders.match(/const canEdit = \['owner', 'admin'\]\.includes\(profile\.role\)/g)?.length,
  1,
  'Work Order list Edit must be limited to Owner and Admin',
)

const invoicePage = read('src/app/(dashboard)/finance/invoices/page.tsx')
assert.ok(
  invoicePage.includes("const canEditDelete = ['owner', 'admin', 'manager'].includes(userRole)"),
  'invoice page must preserve its existing privileged-role gate',
)

const invoices = read('src/app/(dashboard)/finance/invoices/InvoiceTableClient.tsx')
for (const marker of [
  "const canEdit = canEditDelete && !['paid', 'cancelled'].includes(inv.status)",
  'href={withReturnTo(`/finance/invoices/${inv.id}/edit`, source)}',
  '<Pencil className="w-3.5 h-3.5" /> Edit',
]) {
  assert.ok(invoices.includes(marker), `invoice list is missing: ${marker}`)
}
const editStart = invoices.indexOf('{canEdit && (')
const hoverStart = invoices.indexOf('opacity-0 group-hover:opacity-100', editStart)
assert.ok(editStart >= 0, 'invoice Edit action must be rendered')
assert.ok(
  hoverStart > editStart,
  'invoice Edit action must sit outside the hover-hidden secondary actions',
)

console.log('owner/admin edit-option assertions passed')
