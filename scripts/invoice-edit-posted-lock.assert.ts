import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

const editPage = read('src/app/(dashboard)/finance/invoices/[id]/edit/page.tsx')
for (const marker of [
  'posting_sequence, discount_amount',
  "!['admin', 'owner'].includes(role)",
  "!['draft', 'issued'].includes(invoiceRaw.status)",
]) {
  assert.ok(editPage.includes(marker), `invoice edit page is missing: ${marker}`)
}

const form = read('src/app/(dashboard)/finance/invoices/[id]/edit/EditInvoiceForm.tsx')
for (const marker of [
  'posting_sequence: number | null',
  'const isPosted = invoice.posting_sequence !== null',
  "const canEditFinancials = !isPosted || invoice.status === 'issued'",
  'const body = !canEditFinancials',
  '? metadata',
  'This invoice has payment or cancellation activity.',
  '{canEditFinancials && (',
]) {
  assert.ok(form.includes(marker), `invoice edit form is missing: ${marker}`)
}

const metadataStart = form.indexOf('const metadata = {')
const postedBranchEnd = form.indexOf('const res = await fetch', metadataStart)
const submitPayload = form.slice(metadataStart, postedBranchEnd)
assert.ok(metadataStart >= 0 && postedBranchEnd > metadataStart, 'invoice submit payload must be inspectable')
for (const marker of [
  'due_date:',
  'work_order_id:',
  'ref_number:',
  'notes:',
  'terms_and_conditions:',
]) {
  assert.ok(submitPayload.includes(marker), `posted metadata is missing: ${marker}`)
}
for (const marker of [
  'customer_id:',
  'invoice_type:',
  'invoice_date:',
  'discount_amount:',
  'items:',
]) {
  assert.ok(submitPayload.includes(marker), `editable invoice payload must retain: ${marker}`)
  assert.equal(
    submitPayload.slice(metadataStart, submitPayload.indexOf('? metadata')).includes(marker),
    false,
    `locked posted metadata must omit financial field: ${marker}`,
  )
}

const route = read('src/app/api/invoices/[id]/route.ts')
for (const marker of [
  "existing.status === 'issued' && Number(existing.amount_paid ?? 0) === 0",
  "'revise_issued_customer_invoice'",
  'Only unpaid issued invoices can have their accounting details and line items revised',
  "const ALLOWED_FIELDS = ['status', 'notes', 'terms_and_conditions', 'due_date', 'invoice_date', 'ref_number']",
  "currentInvoice.status !== 'draft' && 'invoice_date' in updatePayload",
  "!['admin', 'owner'].includes(profile.role)",
  ".eq('organization_id', profile.organization_id)",
]) {
  assert.ok(route.includes(marker), `invoice PATCH route is missing: ${marker}`)
}

console.log('posted invoice edit-lock assertions passed')
