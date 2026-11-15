import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

const form = read('src/app/(dashboard)/finance/invoices/merge/MergeInvoiceForm.tsx')
for (const marker of [
  'status=issued&unpaid_only=true',
  'Showing unpaid issued invoices eligible for merging',
  'No unpaid issued invoices eligible for merging were found',
  '1 consolidated issued invoice',
  'reverses the {selectedIds.size} source invoices',
]) {
  assert.ok(form.includes(marker), `monthly invoice form is missing: ${marker}`)
}
assert.equal(form.includes('status_not=issued,partial,paid'), false)

const invoicesRoute = read('src/app/api/invoices/route.ts')
for (const marker of [
  "const status = searchParams.get('status')",
  "const unpaidOnly = searchParams.get('unpaid_only') === 'true'",
  "if (status) query = query.eq('status', status)",
  "if (unpaidOnly) query = query.eq('amount_paid', 0).gt('balance_due', 0).neq('invoice_type', 'credit_note')",
]) {
  assert.ok(invoicesRoute.includes(marker), `invoice list route is missing: ${marker}`)
}

const mergeRoute = read('src/app/api/invoices/merge/route.ts')
for (const marker of [
  "if (!['admin', 'owner'].includes(profile.role))",
  "'merge_issued_customer_invoices'",
  'p_invoice_ids: invoice_ids',
  'p_actor_id: user.id',
  '!Number.isFinite(discount)',
  'merged from ${invoice_ids.length} issued invoices',
]) {
  assert.ok(mergeRoute.includes(marker), `merge route is missing: ${marker}`)
}
for (const unsafeMarker of [
  ".from('invoices').update({",
  ".from('invoice_items').insert(",
  "status: 'cancelled'",
]) {
  assert.equal(mergeRoute.includes(unsafeMarker), false, `merge route still performs non-transactional write: ${unsafeMarker}`)
}

const mergePage = read('src/app/(dashboard)/finance/invoices/merge/page.tsx')
assert.ok(mergePage.includes("!['owner', 'admin'].includes(userRole)"))

const migration = read('supabase/migrations/066_merge_issued_customer_invoices.sql')
const hardeningMigration = read('supabase/migrations/067_harden_issued_invoice_lifecycle.sql')
const finalMigration = read('supabase/migrations/068_finalize_issued_invoice_lifecycle.sql')
for (const marker of [
  'create or replace function public.merge_issued_customer_invoices(',
  "array['owner', 'admin']",
  "v_source.status <> 'issued'",
  'for update',
  "'Reversal — ' || v_original.description",
  "'Merged into ' || v_invoice_number",
  "set status = 'issued'",
  'current_posting_id = v_posting_id',
  'grant execute on function public.merge_issued_customer_invoices(',
]) {
  assert.ok(migration.includes(marker), `merge migration is missing: ${marker}`)
}
for (const marker of [
  'create or replace function public.merge_issued_customer_invoices(',
  "v_source.invoice_type = 'credit_note'",
  'from public.customer_advance_allocations a',
  'select coalesce(sum(i.subtotal), 0)',
  'coalesce(ii.line_total, ii.total_price)',
  "j.source_type in ('invoice', 'invoice_revision')",
]) {
  assert.ok(hardeningMigration.includes(marker), `merge hardening migration is missing: ${marker}`)
}
for (const marker of [
  "p_discount_amount = 'NaN'::numeric",
  'coalesce(sum(i.subtotal), 0), coalesce(sum(i.total_amount), 0)',
  'v_discount := v_subtotal - v_source_total + v_discount',
  'v_original.credit_amount, v_original.debit_amount, v_original.source_type',
]) {
  assert.ok(finalMigration.includes(marker), `final merge migration is missing: ${marker}`)
}
const finalMergeFunction = finalMigration.slice(
  finalMigration.indexOf('create or replace function public.merge_issued_customer_invoices('),
  finalMigration.indexOf('create or replace function public.revise_issued_customer_invoice('),
)
assert.equal(
  finalMergeFunction.includes("when status = 'invoiced' then 'completed'::public.work_order_status"),
  false,
  'merge must keep source work orders billed through their cancelled source links',
)

console.log('monthly invoice merge assertions passed')
