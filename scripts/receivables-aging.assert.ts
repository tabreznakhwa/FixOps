import assert from 'node:assert/strict'
import {
  buildReceivableAging,
  daysPastDue,
} from '../src/app/(dashboard)/finance/receivables/receivablesAging'

assert.equal(daysPastDue('2026-10-17', '2026-10-17'), 0)
assert.equal(daysPastDue('2026-10-17', '2026-10-16'), 1)
assert.equal(daysPastDue('2026-10-17', '2026-09-17'), 30)
assert.equal(daysPastDue('2026-10-17', '2026-09-16'), 31)
assert.equal(daysPastDue('2026-10-17', '2026-08-18'), 60)
assert.equal(daysPastDue('2026-10-17', '2026-08-17'), 61)

assert.deepEqual(buildReceivableAging([
  { balance_due: 1, due_date: null },
  { balance_due: 2, due_date: '2026-10-17' },
  { balance_due: 3, due_date: '2026-10-16' },
  { balance_due: 4, due_date: '2026-09-17' },
  { balance_due: 5, due_date: '2026-09-16' },
  { balance_due: 6, due_date: '2026-08-18' },
  { balance_due: 7, due_date: '2026-08-17' },
], '2026-10-17'), {
  current: 3,
  '30': 7,
  '60': 11,
  '90+': 7,
})

console.log('receivables aging assertions passed')
