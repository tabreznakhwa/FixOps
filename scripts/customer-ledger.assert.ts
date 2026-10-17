import assert from 'node:assert/strict'
import {
  buildCustomerLedger,
  compareCustomerLedgerEvents,
  type CustomerLedgerEvent,
} from '../src/app/(dashboard)/finance/ledger/customerLedger'

function event(
  value: Omit<CustomerLedgerEvent, 'documentDate' | 'provenance' | 'reversalOf'>
    & Partial<Pick<CustomerLedgerEvent, 'documentDate' | 'provenance' | 'reversalOf'>>,
): CustomerLedgerEvent {
  return {
    documentDate: value.date,
    provenance: 'live',
    reversalOf: null,
    ...value,
  }
}

const events: CustomerLedgerEvent[] = [
  event({ sourceId: 'payment-late', date: '2026-02-15', description: 'Payment', type: 'payment', reference: 'PMT-2', debit: 0, credit: 50, sequence: 5 }),
  event({ sourceId: 'opening', date: '2025-12-31', description: 'Opening receivable', type: 'opening_balance', reference: 'OPEN-1', debit: 100, credit: 0, sequence: 1, provenance: 'inferred' }),
  event({ sourceId: 'payment-same-day', date: '2026-02-01', description: 'Same-day payment', type: 'payment', reference: 'PMT-1', debit: 0, credit: 40, sequence: 4 }),
  event({ sourceId: 'invoice-same-day', date: '2026-02-01', description: 'Same-day invoice', type: 'invoice', reference: 'INV-1', debit: 60, credit: 0, sequence: 3 }),
  event({ sourceId: 'invoice-before', date: '2026-01-15', description: 'Prior invoice', type: 'invoice', reference: 'INV-0', debit: 25, credit: 0, sequence: 2 }),
]

const allTime = buildCustomerLedger(events)
assert.equal(allTime.currentBalance, 95)
assert.equal(allTime.periodClosingBalance, 95)
assert.deepEqual(
  allTime.rows.map((row) => row.sourceId),
  ['opening', 'invoice-before', 'invoice-same-day', 'payment-same-day', 'payment-late'],
)
assert.equal(allTime.rows[0].runningBalance, 100)
assert.equal(allTime.rows.at(-1)?.runningBalance, 95)
assert.equal(allTime.rows[0].provenance, 'inferred')

const period = buildCustomerLedger(events, { from: '2026-02-01', to: '2026-02-01' })
assert.equal(period.periodOpeningBalance, 125)
assert.equal(period.periodOpeningDate, '2026-01-31')
assert.deepEqual(period.rows.map((row) => row.sourceId), ['invoice-same-day', 'payment-same-day'])
assert.equal(period.periodDebit, 60)
assert.equal(period.periodCredit, 40)
assert.equal(period.periodClosingBalance, 145)
assert.equal(period.currentBalance, 95)
assert.deepEqual(period.rows.map((row) => row.runningBalance), [185, 145])

const upperOnly = buildCustomerLedger(events, { to: '2026-01-31' })
assert.deepEqual(upperOnly.rows.map((row) => row.sourceId), ['opening', 'invoice-before'])
assert.equal(upperOnly.periodClosingBalance, 125)
assert.equal(upperOnly.currentBalance, 95)
assert.equal(compareCustomerLedgerEvents(events[2], events[3]) > 0, true)

const withCreditNote = buildCustomerLedger([
  event({ sourceId: 'invoice', date: '2026-04-01', description: 'Invoice', type: 'invoice', reference: 'INV-100', debit: 10, credit: 0, sequence: 10 }),
  event({ sourceId: 'credit-note', date: '2026-04-02', description: 'Credit Note', type: 'credit_note', reference: 'CN-100', debit: 0, credit: 2.5, sequence: 11 }),
])
assert.equal(withCreditNote.currentBalance, 7.5)
assert.equal(withCreditNote.rows.at(-1)?.runningBalance, 7.5)

const threeDecimalSettlement = buildCustomerLedger([
  event({ sourceId: 'decimal-invoice', date: '2026-05-01', description: 'Invoice', type: 'invoice', reference: 'INV-DEC', debit: 0.1 + 0.2, credit: 0, sequence: 20 }),
  event({ sourceId: 'decimal-payment', date: '2026-05-02', description: 'Payment', type: 'payment', reference: 'PMT-DEC', debit: 0, credit: 0.3, sequence: 21 }),
])
assert.equal(threeDecimalSettlement.currentBalance, 0)
assert.equal(threeDecimalSettlement.rows.at(-1)?.runningBalance, 0)

// Cancellation preserves the original posting and appends a linked reversal.
const reversedPayment = buildCustomerLedger([
  event({ sourceId: 'posting-invoice', date: '2026-06-01', documentDate: '2026-05-31', description: 'Invoice', type: 'invoice', reference: 'INV-REV', debit: 30, credit: 0, sequence: 30 }),
  event({ sourceId: 'posting-payment', date: '2026-06-02', description: 'Payment', type: 'payment', reference: 'PMT-REV', debit: 0, credit: 30, sequence: 31 }),
  event({ sourceId: 'posting-reversal', date: '2026-06-03', description: 'Reversal — Payment', type: 'reversal', reference: 'PMT-REV', debit: 30, credit: 0, sequence: 32, reversalOf: 'posting-payment' }),
])
assert.deepEqual(reversedPayment.rows.map((row) => row.sourceId), [
  'posting-invoice',
  'posting-payment',
  'posting-reversal',
])
assert.equal(reversedPayment.rows[2].reversalOf, 'posting-payment')
assert.equal(reversedPayment.rows[0].documentDate, '2026-05-31')
assert.equal(reversedPayment.currentBalance, 30)
assert.deepEqual(reversedPayment.rows.map((row) => row.runningBalance), [30, 0, 30])

console.log('customer ledger assertions passed')
