import assert from 'node:assert/strict'
import { buildVendorLedger } from '../src/app/(dashboard)/suppliers/vendor-outstanding/vendorLedger'

type Posting = {
  id: string
  party_name: string
  posting_date: string
  document_date: string | null
  posting_sequence: number
  event_type: string
  debit_amount: number
  credit_amount: number
  reference_number: string
  description: string
  provenance: 'live' | 'inferred'
  reversal_of: string | null
}

const postings: Posting[] = [
  {
    id: 'payment', party_name: 'Vendor A', posting_date: '2026-02-02', document_date: '2026-02-01', posting_sequence: 3,
    event_type: 'payment', debit_amount: 40, credit_amount: 0, reference_number: 'SP-1', description: 'Supplier Payment', provenance: 'live', reversal_of: null,
  },
  {
    id: 'invoice', party_name: 'Vendor A', posting_date: '2026-02-01', document_date: '2026-01-31', posting_sequence: 2,
    event_type: 'invoice', debit_amount: 0, credit_amount: 100, reference_number: 'PINV-1', description: 'Purchase Invoice', provenance: 'inferred', reversal_of: null,
  },
  {
    id: 'reversal', party_name: 'Vendor A', posting_date: '2026-02-03', document_date: '2026-02-01', posting_sequence: 4,
    event_type: 'reversal', debit_amount: 0, credit_amount: 40, reference_number: 'SP-1', description: 'Reversal — Supplier Payment', provenance: 'live', reversal_of: 'payment',
  },
]

const admin = {
  from(table: string) {
    assert.equal(table, 'accounting_postings')
    const state: { rows: Posting[]; supplier?: string } = { rows: postings }
    const rangeResult = (from: number, to: number) => {
      assert.equal(from, 0)
      assert.equal(to, 999)
      return Promise.resolve({ data: state.supplier && state.supplier !== 'supplier-1' ? [] : state.rows, error: null })
    }
    const query = {
      select() { return query },
      eq(column: string, value: string) {
        if (column === 'organization_id') assert.equal(value, 'org-1')
        if (column === 'ledger') assert.equal(value, 'ap')
        if (column === 'party_id') state.supplier = value
        return query
      },
      order() { return query },
      range(from: number, to: number) {
        const pending = {
          eq(column: string, value: string) {
            if (column === 'party_id') state.supplier = value
            return rangeResult(from, to)
          },
          then<TResult1 = { data: Posting[]; error: null }, TResult2 = never>(
            onfulfilled?: ((value: { data: Posting[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
          ) {
            return rangeResult(from, to).then(onfulfilled, onrejected)
          },
        }
        return pending
      },
    }
    return query
  },
}

async function main() {
  const ledger = await buildVendorLedger(admin, 'org-1', { supplierId: 'supplier-1' })
  assert.deepEqual(ledger.entries.map((entry) => entry.id), ['invoice', 'payment', 'reversal'])
  assert.equal(ledger.totalCredit, 140)
  assert.equal(ledger.totalDebit, 40)
  assert.equal(ledger.closingBalance, 100)
  assert.equal(ledger.entries[0].provenance, 'inferred')
  assert.equal(ledger.entries[0].documentDate, '2026-01-31')
  assert.equal(ledger.entries[2].reversalOf, 'payment')

  const period = await buildVendorLedger(admin, 'org-1', { supplierId: 'supplier-1', from: '2026-02-02', to: '2026-02-03' })
  assert.equal(period.periodOpeningBalance, 100)
  assert.equal(period.periodDebit, 40)
  assert.equal(period.periodCredit, 40)
  assert.equal(period.closingBalance, 100)

  // The canonical query is journal-only: there is no purchase_orders query and no
  // supplier-payment trace synthesis that could double-count advance applications.
  assert.deepEqual(ledger.failedSources, [])

  const precisionPostings: Posting[] = [
    {
      id: 'precision-invoice-1', party_name: 'Vendor A', posting_date: '2026-03-01', document_date: '2026-03-01', posting_sequence: 10,
      event_type: 'invoice', debit_amount: 0, credit_amount: 0.1, reference_number: 'PINV-10', description: 'Purchase Invoice', provenance: 'live', reversal_of: null,
    },
    {
      id: 'precision-invoice-2', party_name: 'Vendor A', posting_date: '2026-03-01', document_date: '2026-03-01', posting_sequence: 11,
      event_type: 'invoice', debit_amount: 0, credit_amount: 0.2, reference_number: 'PINV-11', description: 'Purchase Invoice', provenance: 'live', reversal_of: null,
    },
    {
      id: 'precision-payment', party_name: 'Vendor A', posting_date: '2026-03-02', document_date: '2026-03-02', posting_sequence: 12,
      event_type: 'payment', debit_amount: 0.3, credit_amount: 0, reference_number: 'SP-10', description: 'Supplier Payment', provenance: 'live', reversal_of: null,
    },
  ]
  const precisionAdmin = {
    from() {
      const query = {
        select() { return query },
        eq() { return query },
        order() { return query },
        range() { return Promise.resolve({ data: precisionPostings, error: null }) },
      }
      return query
    },
  }
  const settled = await buildVendorLedger(precisionAdmin, 'org-1', {})
  assert.equal(settled.totalCredit, 0.3)
  assert.equal(settled.totalDebit, 0.3)
  assert.equal(settled.closingBalance, 0)

  console.log('vendor ledger assertions passed')
}

void main()
