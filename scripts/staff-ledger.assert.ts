import assert from 'node:assert/strict'
import {
  advanceBalancesReconcile,
  buildStaffAdvanceLedger,
  compareStaffAdvanceEvents,
  type StaffAdvanceEvent,
} from '../src/app/(dashboard)/staff/ledger/staffLedger'

const events: StaffAdvanceEvent[] = [
  {
    source: 'repayment',
    sourceId: 'repay-late',
    date: '2026-03-10',
    description: 'Repayment',
    type: 'repayment',
    debit: 0,
    credit: 20,
  },
  {
    source: 'salary_recovery',
    sourceId: 'salary-same-day',
    date: '2026-02-28',
    description: 'Salary recovery',
    type: 'recovery',
    debit: 0,
    credit: 30,
  },
  {
    source: 'advance_issue',
    sourceId: 'advance-before',
    date: '2026-01-15',
    description: 'Advance issued',
    type: 'advance',
    debit: 40,
    credit: 0,
  },
  {
    source: 'repayment',
    sourceId: 'repay-same-day',
    date: '2026-02-28',
    description: 'Same-day repayment',
    type: 'repayment',
    debit: 0,
    credit: 10,
  },
  {
    source: 'advance_issue',
    sourceId: 'loan-same-day',
    date: '2026-02-28',
    description: 'Loan issued',
    type: 'loan',
    debit: 100,
    credit: 0,
  },
]

const allTime = buildStaffAdvanceLedger(events, {
  openingAdvance: 25,
  openingLoan: 75,
})
assert.equal(allTime.openingBase, 100)
assert.equal(allTime.calculatedCurrentBalance, 180)
assert.equal(allTime.periodClosingBalance, 180)
assert.deepEqual(
  allTime.rows.map((row) => row.sourceId),
  ['advance-before', 'loan-same-day', 'salary-same-day', 'repay-same-day', 'repay-late'],
)
assert.deepEqual(allTime.rows.map((row) => row.balance), [140, 240, 210, 200, 180])

const period = buildStaffAdvanceLedger(events, {
  openingAdvance: 25,
  openingLoan: 75,
  from: '2026-02-01',
  to: '2026-02-28',
})
assert.equal(period.periodOpeningBalance, 140)
assert.equal(period.periodOpeningDate, '2026-01-31')
assert.equal(period.periodDebit, 100)
assert.equal(period.periodCredit, 40)
assert.equal(period.periodClosingBalance, 200)
assert.equal(period.calculatedCurrentBalance, 180)
assert.deepEqual(period.rows.map((row) => row.balance), [240, 210, 200])

const upperOnly = buildStaffAdvanceLedger(events, {
  openingAdvance: 25,
  openingLoan: 75,
  to: '2026-01-31',
})
assert.deepEqual(upperOnly.rows.map((row) => row.sourceId), ['advance-before'])
assert.equal(upperOnly.periodClosingBalance, 140)
assert.equal(upperOnly.calculatedCurrentBalance, 180)

assert.equal(compareStaffAdvanceEvents(events[3], events[1]) > 0, true)
assert.equal(advanceBalancesReconcile(180, 180.001), true)
assert.equal(advanceBalancesReconcile(180, 180.002), false)

console.log('staff ledger assertions passed')
