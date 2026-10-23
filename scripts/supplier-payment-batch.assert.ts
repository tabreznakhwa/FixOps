import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  calculateSupplierInvoiceSettlement,
  MAX_SUPPLIER_PAYMENT_SETTLEMENTS,
  parseSupplierPaymentInput,
  toKwdFils,
} from '../src/lib/supplierPayments'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')
const supplierId = '11111111-1111-4111-8111-111111111111'
const firstInvoiceId = '22222222-2222-4222-8222-222222222222'
const secondInvoiceId = '33333333-3333-4333-8333-333333333333'

const settlement = (
  purchaseInvoiceId: string,
  expectedBalanceDue: string,
  amountPaid: string,
  discountAmount: string,
) => ({
  purchase_invoice_id: purchaseInvoiceId,
  expected_balance_due: expectedBalanceDue,
  amount_paid: amountPaid,
  discount_amount: discountAmount,
})

const request = (settlements: ReturnType<typeof settlement>[]) => ({
  supplier_id: supplierId,
  settlements,
  payment_date: '2026-10-22',
  payment_mode: 'bank_transfer',
  reference_number: null,
  notes: null,
})

assert.deepEqual(calculateSupplierInvoiceSettlement('10.000', '0.000'), {
  success: true,
  value: { balance: 10, discount: 0, cash: 10 },
})
assert.deepEqual(calculateSupplierInvoiceSettlement('10.000', '2.250'), {
  success: true,
  value: { balance: 10, discount: 2.25, cash: 7.75 },
})
assert.deepEqual(calculateSupplierInvoiceSettlement('10.000', '0.500', '4.000'), {
  success: true,
  value: { balance: 10, discount: 0.5, cash: 4 },
})
assert.deepEqual(calculateSupplierInvoiceSettlement('10.000', '10.000'), {
  success: true,
  value: { balance: 10, discount: 10, cash: 0 },
})
for (const [balance, discount, cash] of [
  ['10.000', '-0.001', undefined],
  ['10.000', '0.0001', undefined],
  ['10.000', '10.001', undefined],
  ['10.000', '0.500', '9.501'],
  ['10.000', '0.000', '0.000'],
  ['NaN', '0.000', undefined],
  ['Infinity', '0.000', undefined],
] as const) {
  assert.equal(calculateSupplierInvoiceSettlement(balance, discount, cash).success, false)
}
assert.equal(toKwdFils('0.001'), 1)
assert.equal(toKwdFils('0.100'), 100)
assert.equal(toKwdFils('0.200'), 200)
assert.equal(toKwdFils('0.0001'), null)
assert.equal(toKwdFils(Number.NaN), null)
assert.equal(toKwdFils(Number.POSITIVE_INFINITY), null)

for (const entry of [
  settlement(firstInvoiceId, '10.000', '10.000', '0.000'),
  settlement(firstInvoiceId, '10.000', '4.000', '0.000'),
  settlement(firstInvoiceId, '10.000', '7.750', '2.250'),
  settlement(firstInvoiceId, '10.000', '0.000', '10.000'),
]) {
  assert.equal(parseSupplierPaymentInput(request([entry])).success, true)
}

const batchRequest = request([
  settlement(firstInvoiceId, '10.001', '9.900', '0.101'),
  settlement(secondInvoiceId, '20.002', '17.502', '2.500'),
])
const parsedBatch = parseSupplierPaymentInput(batchRequest)
assert.equal(parsedBatch.success, true)
if (parsedBatch.success) {
  const cashFils = parsedBatch.value.settlements.reduce(
    (sum, entry) => sum + (toKwdFils(entry.amountPaid) ?? 0),
    0,
  )
  const discountFils = parsedBatch.value.settlements.reduce(
    (sum, entry) => sum + (toKwdFils(entry.discountAmount) ?? 0),
    0,
  )
  assert.equal(cashFils, 27_402)
  assert.equal(discountFils, 2_601)
  assert.equal(cashFils + discountFils, 30_003)
}

const invalidRequests: unknown[] = [
  null,
  {},
  request([]),
  request(Array.from({ length: MAX_SUPPLIER_PAYMENT_SETTLEMENTS + 1 }, (_, index) => (
    settlement(
      `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
      '1.000',
      '1.000',
      '0.000',
    )
  ))),
  { ...request([settlement(firstInvoiceId, '1.000', '1.000', '0.000')]), invoice_ids: [firstInvoiceId] },
  { ...request([settlement(firstInvoiceId, '1.000', '1.000', '0.000')]), opening_payable_ids: [] },
  { ...request([settlement(firstInvoiceId, '1.000', '1.000', '0.000')]), purchase_order_id: firstInvoiceId },
  { ...request([settlement(firstInvoiceId, '1.000', '1.000', '0.000')]), unexpected: true },
  request([settlement('not-a-uuid', '1.000', '1.000', '0.000')]),
  request([
    settlement(firstInvoiceId, '1.000', '1.000', '0.000'),
    settlement(firstInvoiceId, '1.000', '1.000', '0.000'),
  ]),
  request([settlement(firstInvoiceId, 'NaN', '1.000', '0.000')]),
  request([settlement(firstInvoiceId, 'Infinity', '1.000', '0.000')]),
  request([settlement(firstInvoiceId, '1.0000', '1.000', '0.000')]),
  request([settlement(firstInvoiceId, '1.000', '-0.001', '0.000')]),
  request([settlement(firstInvoiceId, '1.000', '0.0001', '0.000')]),
  request([settlement(firstInvoiceId, '1.000', '0.000', '0.000')]),
  request([settlement(firstInvoiceId, '1.000', '1.001', '0.000')]),
  request([
    settlement(firstInvoiceId, '10.000', '9.000', '0.000'),
    settlement(secondInvoiceId, '20.000', '20.000', '0.000'),
  ]),
  {
    ...request([settlement(firstInvoiceId, '1.000', '1.000', '0.000')]),
    settlements: [{ ...settlement(firstInvoiceId, '1.000', '1.000', '0.000'), unexpected: true }],
  },
  {
    ...request([settlement(firstInvoiceId, '1.000', '1.000', '0.000')]),
    settlements: [{ purchase_invoice_id: firstInvoiceId }],
  },
]
for (const candidate of invalidRequests) {
  assert.equal(parseSupplierPaymentInput(candidate).success, false)
}

const form = read('src/app/(dashboard)/suppliers/vendor-payments/new/VendorPaymentForm.tsx')
for (const marker of [
  'selectedInvoiceIds',
  'discountByInvoiceId',
  'amountManuallyEdited',
  '!amountManuallyEdited',
  'setAmountManuallyEdited(true)',
  'Select all',
  'defaultInvoiceId ? [defaultInvoiceId] : []',
  'clearDiscountsExcept(nextSelectedIds)',
  'calculateSupplierInvoiceSettlement(',
  'selectedInvoices.length === 1 ? amount : undefined',
  'readOnly={selectedInvoices.length !== 1}',
  'Edit for a partial payment',
  'Each invoice will get its own payment record',
  'expected_balance_due:',
  "fetch('/api/suppliers/payments'",
  'router.replace(destination)',
]) {
  assert.ok(form.includes(marker), `vendor payment form is missing: ${marker}`)
}
assert.equal((form.match(/fetch\('\/api\/suppliers\/payments'/g) ?? []).length, 1)
assert.equal(form.includes('purchase_order_id'), false)
assert.equal(form.includes('opening_payable_ids'), false)

const page = read('src/app/(dashboard)/suppliers/vendor-payments/new/page.tsx')
for (const marker of [
  'readPagedRows<',
  ".eq('payment_type', 'credit')",
  ".eq('status', 'confirmed')",
  ".not('posting_sequence', 'is', null)",
  "profile.status !== 'active'",
  'Settle one or more posted purchase invoices',
]) {
  assert.ok(page.includes(marker), `vendor payment page is missing: ${marker}`)
}

const route = read('src/app/api/suppliers/payments/route.ts')
for (const marker of [
  'parseSupplierPaymentInput(body)',
  "profile.status !== 'active'",
  "admin.rpc('record_supplier_payment_batch'",
  'p_settlements: settlements',
  'rows.length !== input.settlements.length',
  'Promise.all(paymentIds.map((paymentId, index) => logAudit({',
  'batch_payment_ids: paymentIds',
  'batch_purchase_invoice_ids: invoiceIds',
]) {
  assert.ok(route.includes(marker), `supplier payment route is missing: ${marker}`)
}
assert.equal((route.match(/\.rpc\('record_supplier_payment_batch'/g) ?? []).length, 1)
assert.equal(route.includes(".rpc('record_supplier_payment',"), false)
assert.equal(route.includes('for (const request of'), false)

const migration = read('supabase/migrations/063_multi_invoice_supplier_payments.sql')
for (const marker of [
  'create or replace function public.record_supplier_payment_batch(',
  'security definer',
  'set search_path = public',
  "array['owner', 'admin', 'manager', 'accounts']",
  "jsonb_typeof(p_settlements) is distinct from 'array'",
  'v_count < 1 or v_count > 100',
  'Settlement positions and purchase invoices must be unique',
  'order by pi.id',
  'for update of pi',
  'get diagnostics v_locked_count = row_count',
  'v_invoice.balance_due <> v_expected_balance',
  'Every invoice in a multi-invoice payment must be settled in full',
  'insert into public.supplier_payments',
  "'supplier_payment'",
  "'supplier_payment_discount'",
  "'adjustment'",
  'and sp.is_cancelled = false',
  'return next',
  ') from public, anon, authenticated;',
  ') to service_role;',
  'commit;',
]) {
  assert.ok(migration.includes(marker), `supplier payment batch migration is missing: ${marker}`)
}

const accountingMigration = read('supabase/migrations/055_accounting_posting_lifecycle.sql')
for (const marker of [
  'create or replace function public.cancel_supplier_payment(',
  "j.source_type not in ('supplier_payment', 'supplier_payment_discount')",
  'v_payment.discount_amount',
  'coalesce(sp.amount_paid, 0) + coalesce(sp.discount_amount, 0)',
]) {
  assert.ok(accountingMigration.includes(marker), `supplier payment cancellation is missing: ${marker}`)
}

const databaseTypes = read('src/types/database.ts')
for (const marker of [
  'record_supplier_payment_batch:',
  'p_settlements: Json',
  'settlement_position: number',
  'supplier_payment_id: string',
  'purchase_invoice_id: string',
]) {
  assert.ok(databaseTypes.includes(marker), `database RPC types are missing: ${marker}`)
}

console.log('supplier payment batch assertions passed')
