import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  calculateInvoiceSettlement,
  parseCustomerPaymentInput,
} from '../src/lib/customerPayments'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')
const customerId = '11111111-1111-4111-8111-111111111111'
const invoiceId = '22222222-2222-4222-8222-222222222222'
const baseRequest = {
  customer_id: customerId,
  invoice_id: invoiceId,
  payment_date: '2026-10-20',
  amount_received: '7.750',
  discount_amount: '2.250',
  payment_mode: 'cash',
  reference_number: null,
  notes: null,
  is_advance: false,
}

assert.deepEqual(calculateInvoiceSettlement('10.000', '2.250'), {
  success: true,
  value: { balance: 10, discount: 2.25, cash: 7.75 },
})
assert.deepEqual(calculateInvoiceSettlement('10.000', '10.000'), {
  success: true,
  value: { balance: 10, discount: 10, cash: 0 },
})
assert.deepEqual(calculateInvoiceSettlement('10.000', '0.500', '4.000'), {
  success: true,
  value: { balance: 10, discount: 0.5, cash: 4 },
})
assert.equal(calculateInvoiceSettlement('10.000', '10.001').success, false)
assert.equal(calculateInvoiceSettlement('10.000', '-0.001').success, false)
assert.equal(calculateInvoiceSettlement('10.000', '0.0001').success, false)
assert.equal(calculateInvoiceSettlement('10.000', '0.500', '9.501').success, false)
assert.equal(calculateInvoiceSettlement('10.000', '0.000', '0.000').success, false)
assert.equal(calculateInvoiceSettlement('10.000', '0.000', '0.0001').success, false)

const independent = [
  calculateInvoiceSettlement('10.000', '1.000'),
  calculateInvoiceSettlement('20.000', '2.500'),
]
assert.equal(independent[0].success && independent[0].value.cash, 9)
assert.equal(independent[1].success && independent[1].value.cash, 17.5)

const valid = parseCustomerPaymentInput(baseRequest)
assert.equal(valid.success, true)
if (valid.success) {
  assert.equal(valid.value.amountReceived, 7.75)
  assert.equal(valid.value.discountAmount, 2.25)
}
assert.equal(parseCustomerPaymentInput({ ...baseRequest, payment_mode: 'knet' }).success, true)
assert.equal(parseCustomerPaymentInput({
  ...baseRequest,
  amount_received: '0.000',
  discount_amount: '10.000',
}).success, true)
for (const request of [
  { ...baseRequest, discount_amount: '-0.001' },
  { ...baseRequest, discount_amount: '0.0001' },
  { ...baseRequest, amount_received: '0.000', discount_amount: '0.000' },
  { ...baseRequest, invoice_id: null, discount_amount: '1.000' },
  { ...baseRequest, invoice_id: null, is_advance: true, discount_amount: '1.000' },
]) {
  assert.equal(parseCustomerPaymentInput(request).success, false)
}

const form = read('src/app/(dashboard)/finance/payments/new/NewPaymentForm.tsx')
for (const marker of [
  'discountByInvoiceId',
  'Settlement Discount (KWD)',
  'calculateInvoiceSettlement(',
  'useState(prefilledAmount)',
  "selectedInvoices.length === 1 ? amountReceived : undefined",
  "readOnly={!isAdvance && selectedInvoices.length !== 1}",
  'Edit for a partial payment',
  "{ value: 'knet', label: 'KNET' }",
  'discount_amount: request.discountAmount',
  'discount_amount: 0',
  'Cash received',
  'Settlement discount',
  'Total settled',
  'router.replace(destination)',
]) {
  assert.ok(form.includes(marker), `payment form is missing: ${marker}`)
}

const databaseTypes = read('src/types/database.ts')
assert.ok(databaseTypes.includes("'online' | 'knet' | 'other'"))

const route = read('src/app/api/payments/route.ts')
for (const marker of [
  'parseCustomerPaymentInput(body)',
  'p_discount_amount: input.discountAmount',
  "profile.status !== 'active'",
  'rpcStatus(rpcError.message)',
]) {
  assert.ok(route.includes(marker), `payment route is missing: ${marker}`)
}

const workOrderRoute = read('src/app/api/work-orders/[id]/collect-payment/route.ts')
assert.ok(workOrderRoute.includes('p_discount_amount: 0'))

const migration = read('supabase/migrations/061_customer_payment_settlement_discount.sql')
for (const marker of [
  'discount_amount numeric(13,3)',
  "discount_amount <> 'NaN'::numeric",
  "'discount_amount'",
  'drop function if exists public.record_customer_payment(',
  'p_discount_amount numeric default 0',
  'p_amount_received numeric,',
  "'customer_payment_discount'",
  "'adjustment'",
  'amount_received + coalesce(p.discount_amount, 0)',
  'v_expected_postings',
  "p_amount_received = 'NaN'::numeric",
  "v_discount = 'NaN'::numeric",
  'j.party_id is distinct from v_payment.customer_id',
  'reversal_of',
  "when v_total_paid <= 0 then 'unpaid'::public.payment_status",
  'to service_role;',
]) {
  assert.ok(migration.includes(marker), `discount migration is missing: ${marker}`)
}

const paymentDetailApi = read('src/app/api/payments/[id]/route.ts')
const paymentDetail = read('src/app/(dashboard)/finance/payments/[id]/page.tsx')
const paymentRegister = read('src/app/(dashboard)/finance/payments/page.tsx')
const invoiceDetail = read('src/app/(dashboard)/finance/invoices/[id]/page.tsx')
const invoiceApi = read('src/app/api/invoices/[id]/route.ts')
for (const [name, source] of [
  ['payment detail API', paymentDetailApi],
  ['payment detail', paymentDetail],
  ['payment register', paymentRegister],
  ['invoice detail', invoiceDetail],
  ['invoice API', invoiceApi],
] as const) {
  assert.ok(source.includes('discount_amount'), `${name} does not expose discount_amount`)
}
assert.ok(paymentDetail.includes('Total Settled'))
assert.ok(paymentRegister.includes('Cash Received'))
assert.ok(paymentRegister.includes('Discount only — no cash'))

for (const path of [
  'src/app/(dashboard)/finance/cash-book/page.tsx',
  'src/app/(dashboard)/finance/bank-book/page.tsx',
]) {
  assert.ok(
    read(path).includes(".gt('amount_received', 0)"),
    `${path} should omit zero-cash discount-only rows`,
  )
}

console.log('customer payment settlement discount assertions passed')
