import assert from 'node:assert/strict'
import {
  resolveReceivableSort,
  sortReceivableRows,
  type ReceivableRow,
} from '../src/app/(dashboard)/finance/receivables/receivablesSort'

function row({
  id,
  source = 'invoice',
  reference,
  amount,
  date,
}: {
  id: string
  source?: 'invoice' | 'opening'
  reference: string
  amount: number
  date: string
}): ReceivableRow {
  return {
    rowKey: `${source}:${id}`,
    invoiceId: source === 'invoice' ? id : null,
    source,
    invoice_number: reference,
    balance_due: amount,
    due_date: null,
    status: source === 'invoice' ? 'issued' : 'opening',
    invoice_date: date,
  }
}

const rows = [
  row({ id: '10', reference: 'INV-10', amount: 20, date: '2026-01-03' }),
  row({ id: '2', reference: 'inv-2', amount: 10, date: '2026-01-01' }),
  row({ id: 'opening-2', source: 'opening', reference: 'Inv-2', amount: 20, date: '2026-01-02' }),
  row({ id: '1', reference: 'INV-1', amount: 30, date: '2026-01-03' }),
  row({ id: 'opening-1', source: 'opening', reference: 'OPEN-1', amount: 20, date: '2026-01-03' }),
]

assert.deepEqual(resolveReceivableSort(undefined, undefined), {
  sort: 'amount',
  direction: 'desc',
})
assert.deepEqual(resolveReceivableSort('invalid', 'sideways'), {
  sort: 'amount',
  direction: 'desc',
})
assert.deepEqual(resolveReceivableSort(['date', 'amount'], ['asc', 'desc']), {
  sort: 'amount',
  direction: 'desc',
})
assert.deepEqual(resolveReceivableSort('date', 'asc'), {
  sort: 'date',
  direction: 'asc',
})

const keys = (sorted: ReceivableRow[]) => sorted.map(item => item.rowKey)
assert.deepEqual(keys(sortReceivableRows(rows, 'date', 'asc')), [
  'invoice:2', 'opening:opening-2', 'invoice:1', 'invoice:10', 'opening:opening-1',
])
assert.deepEqual(keys(sortReceivableRows(rows, 'date', 'desc')), [
  'opening:opening-1', 'invoice:10', 'invoice:1', 'opening:opening-2', 'invoice:2',
])
assert.deepEqual(keys(sortReceivableRows(rows, 'amount', 'asc')), [
  'invoice:2', 'invoice:10', 'opening:opening-1', 'opening:opening-2', 'invoice:1',
])
assert.deepEqual(keys(sortReceivableRows(rows, 'amount', 'desc')), [
  'invoice:1', 'opening:opening-2', 'opening:opening-1', 'invoice:10', 'invoice:2',
])
assert.deepEqual(keys(sortReceivableRows(rows, 'invoice', 'asc')), [
  'invoice:1', 'invoice:2', 'opening:opening-2', 'invoice:10', 'opening:opening-1',
])
assert.deepEqual(keys(sortReceivableRows(rows, 'invoice', 'desc')), [
  'opening:opening-1', 'invoice:10', 'opening:opening-2', 'invoice:2', 'invoice:1',
])

const tied = [
  row({ id: 'b', reference: 'SAME', amount: 10, date: '2026-01-01' }),
  row({ id: 'z', source: 'opening', reference: 'SAME', amount: 10, date: '2026-01-01' }),
  row({ id: 'a', reference: 'same', amount: 10, date: '2026-01-01' }),
]
assert.deepEqual(keys(sortReceivableRows(tied, 'invoice', 'asc')), [
  'invoice:a', 'invoice:b', 'opening:z',
])
assert.deepEqual(keys(sortReceivableRows(tied, 'invoice', 'desc')), [
  'opening:z', 'invoice:b', 'invoice:a',
])

const originalKeys = keys(rows)
const sortedRows = sortReceivableRows(rows, 'amount', 'desc')
assert.notStrictEqual(sortedRows, rows)
assert.deepEqual(keys(rows), originalKeys)

const openingRows = [
  row({ id: 'opening-a', source: 'opening', reference: 'OPEN', amount: 5, date: '2025-12-31' }),
  row({ id: 'opening-b', source: 'opening', reference: 'OPEN', amount: 5, date: '2025-12-31' }),
]
assert.equal(new Set(openingRows.map(item => item.rowKey)).size, openingRows.length)
for (const opening of openingRows) {
  assert.equal(opening.source, 'opening')
  assert.equal(opening.invoiceId, null)
}

console.log('receivables sort assertions passed')
