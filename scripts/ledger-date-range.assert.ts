import assert from 'node:assert/strict'
import { resolveLedgerDateRange } from '../src/lib/ledgerDateRange'

assert.deepEqual(resolveLedgerDateRange(undefined, undefined), {
  fromDate: '',
  toDate: '',
  error: null,
})
assert.deepEqual(resolveLedgerDateRange('2026-02-01', '2026-02-28'), {
  fromDate: '2026-02-01',
  toDate: '2026-02-28',
  error: null,
})
assert.deepEqual(resolveLedgerDateRange(undefined, '2026-02-28'), {
  fromDate: '',
  toDate: '2026-02-28',
  error: null,
})
assert.equal(resolveLedgerDateRange('2026-02-30', undefined).fromDate, '')
assert.match(
  resolveLedgerDateRange('2026-02-30', undefined).error ?? '',
  /invalid/i,
)
assert.equal(resolveLedgerDateRange(['2026-02-01', '2026-02-02'], undefined).fromDate, '')
assert.match(
  resolveLedgerDateRange(['2026-02-01', '2026-02-02'], undefined).error ?? '',
  /invalid/i,
)
assert.deepEqual(resolveLedgerDateRange('2026-03-01', '2026-02-28'), {
  fromDate: '',
  toDate: '',
  error: 'From Date must be on or before To Date. Showing the all-time statement instead.',
})

console.log('ledger date range assertions passed')
