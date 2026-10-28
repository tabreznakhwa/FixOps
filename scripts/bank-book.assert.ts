import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BANK_MODES,
  buildBankBook,
  type BankBookSources,
} from '../src/app/(dashboard)/finance/bank-book/bankBook'
import { readPagedRows } from '../src/lib/reportPaging'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

const sources: BankBookSources = {
  receipts: [
    { id: 'receipt-before', payment_date: '2026-10-25', payment_number: 'PMT-BEFORE', amount_received: 20, payment_mode: 'bank_transfer', reference_number: 'R-BEFORE', customers: { full_name: 'Before Customer' } },
    { id: 'receipt-from', payment_date: '2026-10-26', payment_number: 'PMT-FROM', amount_received: 100, payment_mode: 'online', reference_number: 'R-FROM', customers: { full_name: 'From Customer' } },
    { id: 'receipt-to', payment_date: '2026-10-27', payment_number: 'PMT-TO', amount_received: 10, payment_mode: 'knet', reference_number: 'R-TO', customers: { full_name: 'To Customer' } },
  ],
  supplierPayments: [
    { id: 'supplier-before', payment_date: '2026-10-25', amount_paid: 5, payment_mode: 'cheque', reference_number: null, suppliers: { supplier_name: 'Before Supplier' } },
    { id: 'supplier-period', payment_date: '2026-10-26', amount_paid: 30, payment_mode: 'card', reference_number: 'SP-1', suppliers: { supplier_name: 'Period Supplier' } },
  ],
  supplierAdvances: [
    { id: 'supplier-advance', advance_date: '2026-10-26', amount: 7, payment_mode: 'pos', reference_number: 'SA-1', suppliers: { supplier_name: 'Advance Supplier' } },
  ],
  expenses: [
    { id: 'expense', expense_date: '2026-10-26', expense_number: 'EXP-1', category: 'fuel', description: 'Van fuel', amount: 4, payment_method: 'bank_transfer', reference_number: null },
  ],
  salaries: [
    { id: 'salary', payment_date: '2026-10-26', net_salary: 11, payment_mode: 'bank_transfer', staff: { full_name: 'Salary Staff' }, salary_runs: { salary_month: 10, salary_year: 2026 } },
  ],
  advances: [
    { id: 'staff-advance', issued_date: '2026-10-26', type: 'loan', amount: 8, payment_method: 'bank', notes: 'Emergency', settlement_recovery_amount: null, staff: { full_name: 'Advance Staff' } },
    { id: 'leave-settlement', issued_date: '2026-10-27', type: 'advance', amount: 13, payment_method: 'bank_transfer', notes: 'Annual leave', settlement_recovery_amount: 0, staff: { full_name: 'Leave Staff' } },
  ],
  repayments: [
    { id: 'repayment', repayment_date: '2026-10-26', amount: 6, notes: null, staff: { full_name: 'Repayment Staff' } },
  ],
  amcPayments: [
    { id: 'amc', payment_date: '2026-10-26', amount: 9, payment_mode: 'bank_transfer', reference_number: 'AMC-REF', amc_contracts: { contract_number: 'AMC-1', customers: { full_name: 'AMC Customer' } } },
  ],
  transfers: [
    { id: 'transfer-in', transfer_date: '2026-10-26', from_account: 'cash', to_account: 'bank', amount: 12, reference_number: 'TR-IN', notes: null },
    { id: 'transfer-out', transfer_date: '2026-10-26', from_account: 'bank', to_account: 'cash', amount: 3, reference_number: 'TR-OUT', notes: null },
  ],
  withdrawals: [
    { id: 'withdrawal', withdrawal_date: '2026-10-26', amount: 2, payment_mode: 'online', purpose: 'Owner draw', notes: null },
  ],
  bonuses: [
    { id: 'bonus', bonus_date: '2026-10-27', amount: 1, payment_mode: 'knet', notes: null, staff: { full_name: 'Bonus Staff' } },
  ],
  assetDisposals: [
    { id: 'asset', disposal_date: '2026-10-27', disposal_proceeds: 15, disposal_payment_method: 'cheque', disposal_reference: 'ASSET-REF', asset_code: 'AST-1', asset_name: 'Old Unit' },
  ],
}

const periodBook = buildBankBook(sources, {
  openingBank: 50,
  openingDate: '2026-01-01',
  from: '2026-10-26',
  to: '2026-10-27',
  allTime: false,
})

assert.equal(periodBook.totalBankIn, 172)
assert.equal(periodBook.totalBankOut, 84)
assert.equal(periodBook.closingBalance, 138)
assert.equal(periodBook.periodOpeningBalance, 65)
assert.equal(periodBook.periodOpeningDate, '2026-10-25')
assert.equal(periodBook.periodReceipts, 152)
assert.equal(periodBook.periodPayments, 79)
assert.equal(periodBook.entries.length, 15)
assert.ok(periodBook.entries.some((entry) => entry.id === 'receipt-receipt-from' && entry.mode === 'Online'))
assert.ok(periodBook.entries.some((entry) => entry.id === 'receipt-receipt-to' && entry.mode === 'KNET'))
assert.ok(periodBook.entries.some((entry) => entry.id === 'transfer-in-transfer-in' && entry.receipts === 12))
assert.ok(periodBook.entries.some((entry) => entry.id === 'transfer-out-transfer-out' && entry.payments === 3))
assert.ok(periodBook.entries.some((entry) => entry.id === 'asset-disposal-asset' && entry.receipts === 15))
assert.ok(periodBook.entries.some((entry) => (
  entry.id === 'staff-advance-leave-settlement'
  && entry.narration === 'Leave Settlement — Leave Staff (Annual leave)'
  && entry.mode === 'Bank Transfer'
  && entry.payments === 13
)))
assert.equal(periodBook.entries[0].date, '2026-10-26')
assert.equal(periodBook.entries.at(-1)?.date, '2026-10-27')
for (let index = 1; index < periodBook.entries.length; index += 1) {
  const previous = periodBook.entries[index - 1]
  const current = periodBook.entries[index]
  assert.ok(
    previous.date < current.date || (previous.date === current.date && previous.id < current.id),
    'entries must use stable date-plus-id ordering',
  )
}

const allTimeBook = buildBankBook(sources, {
  openingBank: 50,
  openingDate: '2026-01-01',
  from: '2026-10-27',
  to: '2026-10-27',
  allTime: true,
})
assert.equal(allTimeBook.entries.length, 17)
assert.equal(allTimeBook.periodOpeningBalance, 50)
assert.equal(allTimeBook.periodOpeningDate, '2026-01-01')
assert.equal(allTimeBook.periodReceipts, 172)
assert.equal(allTimeBook.periodPayments, 84)

assert.deepEqual(BANK_MODES, ['bank_transfer', 'cheque', 'pos', 'online', 'card', 'knet'])
assert.equal(BANK_MODES.includes('cash' as never), false)
assert.equal(BANK_MODES.includes('other' as never), false)

async function runPagingAssertions() {
const pagingFailures: string[] = []
const pagingRows = Array.from({ length: 1_008 }, (_, index) => ({
  id: String(index + 1).padStart(4, '0'),
  date: index < 1_000 ? '2026-10-25' : '2026-10-26',
}))
const ranges: Array<[number, number]> = []
const fullyPagedRows = await readPagedRows(
  async (from, to) => {
    ranges.push([from, to])
    return { data: pagingRows.slice(from, to + 1), error: null }
  },
  pagingFailures,
  'customer payments',
)
assert.equal(fullyPagedRows.length, 1_008)
assert.equal(fullyPagedRows.at(-1)?.date, '2026-10-26')
assert.deepEqual(ranges, [[0, 999], [1000, 1999]])
assert.deepEqual(pagingFailures, [])

const failureMessages: string[] = []
const partialRows = await readPagedRows(
  async (from) => from === 0
    ? { data: Array.from({ length: 1_000 }, (_, index) => index), error: null }
    : { data: null, error: { message: 'database unavailable' } },
  failureMessages,
  'customer payments',
)
assert.equal(partialRows.length, 1_000)
assert.deepEqual(failureMessages, ['customer payments: database unavailable'])
}

const page = read('src/app/(dashboard)/finance/bank-book/page.tsx')
for (const marker of [
  'const supabase = await createClient()',
  'const financeDb = supabase as any',
  'const admin = createAdminClient() as any',
  ".eq('organization_id', profile.organization_id)",
  "readPagedRows<T>(buildQuery, sourceFailures, source)",
  "'customer payments'",
  "'supplier payments'",
  "'supplier advances'",
  "'expenses'",
  "'salary payments'",
  "'staff advances'",
  ".in('payment_method', ['bank', 'bank_transfer', 'cheque'])",
  "'staff advance repayments'",
  "'AMC payments'",
  "'fund transfers'",
  "'owner withdrawals'",
  "'staff bonuses'",
  ".order('id', { ascending: true })",
  '.range(rangeFrom, rangeTo)',
  '<strong>These figures are incomplete.</strong>',
  'buildBankBook({',
  'key={entry.id}',
]) {
  assert.ok(page.includes(marker), `Bank Book page is missing: ${marker}`)
}
assert.equal(page.includes('.limit(5000)'), false)
assert.equal(page.includes('const financeDb = createAdminClient() as any'), false)
assert.ok(page.includes('fetchAllAssetDisposalsForBook(\n      admin,'))
assert.ok((page.match(/\.eq\('organization_id', profile\.organization_id\)/g) ?? []).length >= 11)
assert.ok((page.match(/\.range\(rangeFrom, rangeTo\)/g) ?? []).length >= 11)
assert.ok((page.match(/\.order\('id', \{ ascending: true \}\)/g) ?? []).length >= 11)

const assetLoader = read('src/lib/assets.server.ts')
for (const marker of [
  "select('id, disposal_date, disposal_proceeds",
  ".order('disposal_date', { ascending: true })",
  ".order('id', { ascending: true })",
  '.range(offset, offset + PAGE_SIZE - 1)',
]) {
  assert.ok(assetLoader.includes(marker), `asset disposal paging is missing: ${marker}`)
}

const dateRangeFilter = read('src/components/ui/DateRangeFilter.tsx')
assert.ok(dateRangeFilter.includes("const TZ = 'Asia/Kuwait'"))
assert.ok(dateRangeFilter.includes("{ label: 'Yesterday', range: () => { const t = addDays(kwDate(), -1); return { from: t, to: t } } }"))

runPagingAssertions().then(() => {
  console.log('bank book assertions passed')
}).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
