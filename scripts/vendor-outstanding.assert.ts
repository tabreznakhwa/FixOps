import assert from 'node:assert/strict'
import { buildBillWiseOutstanding } from '../src/app/(dashboard)/suppliers/vendor-outstanding/billWiseOutstanding'
import { buildVendorWiseOutstanding } from '../src/app/(dashboard)/suppliers/vendor-outstanding/vendorWiseOutstanding'
import { readPagedRows } from '../src/app/(dashboard)/suppliers/vendor-outstanding/reportPaging'

type Row = Record<string, unknown>
type Result = { data: Row[] | null; error: { message: string } | null }

type Query = PromiseLike<Result> & {
  select: (...args: unknown[]) => Query
  eq: (column: string, value: unknown) => Query
  neq: (column: string, value: unknown) => Query
  is: (column: string, value: unknown) => Query
  gt: (column: string, value: unknown) => Query
  gte: (column: string, value: unknown) => Query
  lte: (column: string, value: unknown) => Query
  in: (column: string, values: unknown[]) => Query
  order: (...args: unknown[]) => Query
  range: (from: number, to: number) => Query
}

function queryFor(rows: Row[], failure?: string): Query {
  let filtered = [...rows]
  let from = 0
  let to = rows.length
  const has = (row: Row, column: string) => Object.prototype.hasOwnProperty.call(row, column)
  const keep = (column: string, predicate: (value: unknown) => boolean) => {
    filtered = filtered.filter((row) => !has(row, column) || predicate(row[column]))
  }
  const result = () => Promise.resolve<Result>(failure
    ? { data: null, error: { message: failure } }
    : { data: filtered.slice(from, to + 1), error: null })
  const query = {
    select() { return query },
    eq(column: string, value: unknown) { keep(column, (candidate) => candidate === value); return query },
    neq(column: string, value: unknown) { keep(column, (candidate) => candidate !== value); return query },
    is(column: string, value: unknown) { keep(column, (candidate) => candidate === value); return query },
    gt(column: string, value: unknown) { keep(column, (candidate) => String(candidate) > String(value)); return query },
    gte(column: string, value: unknown) { keep(column, (candidate) => String(candidate) >= String(value)); return query },
    lte(column: string, value: unknown) { keep(column, (candidate) => String(candidate) <= String(value)); return query },
    in(column: string, values: unknown[]) { keep(column, (candidate) => values.includes(candidate)); return query },
    order() { return query },
    range(nextFrom: number, nextTo: number) {
      from = nextFrom
      to = nextTo
      return query
    },
    then<TResult1 = Result, TResult2 = never>(
      onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return result().then(onfulfilled, onrejected)
    },
  }
  return query
}

const supplier = { id: 'supplier-1', supplier_name: 'Vendor A', supplier_code: 'VA' }
const sources: Record<string, Row[]> = {
  opening_payables: [
    {
      id: 'opening-1', bill_ref: 'DUP-REF', bill_date: '2026-01-01', due_date: null,
      amount: 40, balance_due: 30, supplier_id: 'supplier-1', suppliers: supplier,
      reversal_posting_id: null,
    },
    {
      id: 'opening-2', bill_ref: 'DUP-REF', bill_date: '2026-01-02', due_date: null,
      amount: 25, balance_due: 25, supplier_id: 'supplier-1', suppliers: supplier,
      reversal_posting_id: null,
    },
  ],
  purchase_invoices: [
    {
      id: 'invoice-1', invoice_number: 'PINV-1', invoice_date: '2026-01-03', due_date: '2026-01-10',
      total_amount: 100, amount_paid: 60, balance_due: 40, payment_status: 'partial', status: 'confirmed',
      payment_type: 'credit', supplier_invoice_number: 'SUP-1', supplier_id: 'supplier-1', supplier_name: null,
      suppliers: supplier,
    },
  ],
  purchase_orders: [
    {
      id: 'po-1', po_number: 'PO-1', purchase_date: '2026-01-04', due_date: null, total_amount: 999,
      status: 'partial', supplier_id: 'supplier-1', suppliers: supplier,
      purchase_order_items: [{ quantity: 10, quantity_received: 4, unit_cost: 5 }],
    },
  ],
  supplier_payments: [
    {
      id: 'later-invoice', purchase_invoice_id: 'invoice-1', opening_payable_id: null, supplier_advance_id: null,
      payment_date: '2026-02-01', amount_paid: 10, discount_amount: 2,
    },
    {
      id: 'later-opening', purchase_invoice_id: null, opening_payable_id: 'opening-1', supplier_advance_id: null,
      payment_date: '2026-02-01', amount_paid: 5, discount_amount: 0,
    },
    {
      id: 'advance-trace', purchase_invoice_id: 'invoice-1', opening_payable_id: null, supplier_advance_id: 'advance-1',
      payment_date: '2026-02-01', amount_paid: 50, discount_amount: 0,
    },
  ],
}

const admin = {
  from(table: string) {
    return queryFor(sources[table] ?? [])
  },
}

async function main() {
  const billWise = await buildBillWiseOutstanding(admin, 'org-1', {})
  assert.equal(billWise.payables.reduce((sum, row) => sum + row.outstanding, 0), 95)
  assert.equal(billWise.commitments.length, 1)
  assert.equal(billWise.commitments[0].amount, 30)
  assert.equal(billWise.payables.some((row) => row.number === 'PO-1'), false)
  assert.deepEqual(billWise.failedSources, [])

  const vendorWise = await buildVendorWiseOutstanding(admin, 'org-1', {
    asOn: '2026-01-15',
  })
  assert.equal(vendorWise.grandTotal, 112)
  assert.equal(vendorWise.groups[0].bills.find((row) => row.id === 'opening-1')?.outstanding, 35)
  assert.equal(vendorWise.groups[0].bills.find((row) => row.id === 'opening-2')?.outstanding, 25)
  assert.equal(vendorWise.groups[0].bills.find((row) => row.id === 'invoice-1')?.outstanding, 52)
  assert.equal(vendorWise.grandCommitmentTotal, 30)
  assert.equal(vendorWise.commitmentCount, 1)

  const pagedRows = Array.from({ length: 1001 }, (_, index) => ({ index }))
  const pageFailures: string[] = []
  const paged = await readPagedRows<{ index: number }>(
    (from, to) => Promise.resolve({ data: pagedRows.slice(from, to + 1), error: null }),
    pageFailures,
    'paged source',
  )
  assert.equal(paged.length, 1001)
  assert.deepEqual(pageFailures, [])

  const failedSources: string[] = []
  const partial = await readPagedRows<{ index: number }>(
    (from) => Promise.resolve(from === 0
      ? { data: Array.from({ length: 1000 }, (_, index) => ({ index })), error: null }
      : { data: null, error: { message: 'source unavailable' } }),
    failedSources,
    'broken source',
  )
  assert.equal(partial.length, 1000)
  assert.deepEqual(failedSources, ['broken source: source unavailable'])

  const overflowFailures: string[] = []
  const overflow = await readPagedRows<{ index: number }>(
    (from, to) => Promise.resolve({
      data: Array.from({ length: to - from + 1 }, (_, index) => ({ index: from + index })),
      error: null,
    }),
    overflowFailures,
    'overflow source',
  )
  assert.equal(overflow.length, 50_000)
  assert.deepEqual(overflowFailures, ['overflow source: exceeds 50,000-row safety limit'])

  console.log('vendor outstanding assertions passed')
}

void main()
