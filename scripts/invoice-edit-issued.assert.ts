import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

const detail = read('src/app/(dashboard)/finance/invoices/[id]/page.tsx')
assert.ok(detail.includes("const canEdit = ['admin', 'owner'].includes(role) && ['draft', 'issued'].includes(invoice.status)"))

const editPage = read('src/app/(dashboard)/finance/invoices/[id]/edit/page.tsx')
for (const marker of [
  "if (!['admin', 'owner'].includes(role))",
  "if (!['draft', 'issued'].includes(invoiceRaw.status))",
]) {
  assert.ok(editPage.includes(marker), `invoice edit page is missing: ${marker}`)
}

const form = read('src/app/(dashboard)/finance/invoices/[id]/edit/EditInvoiceForm.tsx')
for (const marker of [
  "const canEditFinancials = !isPosted || invoice.status === 'issued'",
  'if (canEditFinancials && !customerId)',
  'const body = !canEditFinancials',
  'This issued invoice has no payments.',
  '{canEditFinancials && (',
]) {
  assert.ok(form.includes(marker), `invoice edit form is missing: ${marker}`)
}

const route = read('src/app/api/invoices/[id]/route.ts')
for (const marker of [
  "if (!['admin', 'owner'].includes(profile.role))",
  "existing.status === 'issued' && Number(existing.amount_paid ?? 0) === 0",
  "'revise_issued_customer_invoice'",
  'p_items: items',
  '!Number.isFinite(discount)',
  '!Number.isFinite(quantity)',
  'revised issued invoice',
  'Only unpaid issued invoices can have their accounting details and line items revised',
]) {
  assert.ok(route.includes(marker), `invoice PATCH route is missing: ${marker}`)
}

const migration = read('supabase/migrations/066_merge_issued_customer_invoices.sql')
const hardeningMigration = read('supabase/migrations/067_harden_issued_invoice_lifecycle.sql')
const finalMigration = read('supabase/migrations/068_finalize_issued_invoice_lifecycle.sql')
const cancellationFix = read('supabase/migrations/069_fix_revised_invoice_cancellation.sql')
for (const marker of [
  'add column if not exists current_posting_id',
  'create or replace function public.revise_issued_customer_invoice(',
  "array['owner', 'admin']",
  "v_invoice.status <> 'issued'",
  "'invoice_revision'",
  'delete from public.invoice_items where invoice_id = p_invoice_id',
  'current_posting_id = v_posting_id',
  'grant execute on function public.revise_issued_customer_invoice(',
]) {
  assert.ok(migration.includes(marker), `issued invoice revision migration is missing: ${marker}`)
}
for (const marker of [
  'create or replace function public.revise_issued_customer_invoice(',
  'from public.customer_advance_allocations a',
  'Work order is already linked to another active invoice',
  'v_original_work_order_id is distinct from p_work_order_id',
  "set status = 'invoiced'::public.work_order_status",
  'create or replace function public.cancel_customer_invoice(',
  "j.source_type in ('invoice', 'invoice_revision')",
  'Invoice active posting has already been reversed',
]) {
  assert.ok(hardeningMigration.includes(marker), `issued invoice hardening migration is missing: ${marker}`)
}
for (const marker of [
  "p_discount_amount = 'NaN'::numeric",
  "v_quantity = 'NaN'::numeric",
  'v_original.credit_amount, v_original.debit_amount, v_original.source_type',
  'current_posting_id = v_posting_id',
  'posting_sequence = v_seq',
  'set invoice_id = p_invoice_id',
  'sum(p.amount_received + coalesce(p.discount_amount, 0))',
  'Work-order receipts exceed the revised invoice total',
]) {
  assert.ok(finalMigration.includes(marker), `final issued invoice migration is missing: ${marker}`)
}
assert.equal(
  finalMigration.slice(
    finalMigration.indexOf('update public.invoices\n  set customer_id = p_customer_id'),
    finalMigration.indexOf('where id = p_invoice_id;', finalMigration.indexOf('update public.invoices\n  set customer_id = p_customer_id')),
  ).includes('posting_sequence = v_seq'),
  false,
  'revision must not mutate the immutable original posting tuple',
)
for (const marker of [
  'create or replace function public.cancel_customer_invoice(',
  'v_original.credit_amount, v_original.debit_amount, v_original.source_type',
  "j.source_type in ('invoice', 'invoice_revision')",
  'grant execute on function public.cancel_customer_invoice',
]) {
  assert.ok(cancellationFix.includes(marker), `revised-invoice cancellation fix is missing: ${marker}`)
}
assert.equal(cancellationFix.includes('create or replace function public.merge_issued_customer_invoices('), false)
assert.equal(cancellationFix.includes('create or replace function public.revise_issued_customer_invoice('), false)

console.log('issued invoice edit assertions passed')
