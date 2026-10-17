import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthedProfile } from '@/lib/auth/session'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AlertTriangle, FileBarChart } from 'lucide-react'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'
import { LedgerCustomerSelector } from './LedgerCustomerSelector'
import { fetchAllCustomers } from '@/lib/customers'
import { resolveLedgerDateRange } from '@/lib/ledgerDateRange'
import { getRoleAccess } from '@/lib/orgPermissions'
import type { SearchParamValue } from '@/lib/backNav'
import {
  buildCustomerLedger,
  type CustomerLedgerEvent,
} from './customerLedger'

export const metadata = { title: 'Customer Ledger' }

const PAGE_SIZE = 1000
const MAX_ROWS = 50_000

type PageResult<T> = {
  data: T[] | null
  error: { message?: string } | null
}

async function fetchAllPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = []

  try {
    for (let from = 0; from <= MAX_ROWS; from += PAGE_SIZE) {
      const { data, error } = await loadPage(from, from + PAGE_SIZE - 1)
      if (error) return { rows, error: error.message ?? 'Query failed' }
      const page = data ?? []
      if (from === MAX_ROWS) {
        return page.length > 0
          ? { rows, error: `Statement exceeds the ${MAX_ROWS.toLocaleString()}-row safety limit` }
          : { rows, error: null }
      }
      rows.push(...page)
      if (page.length < PAGE_SIZE) return { rows, error: null }
    }
    return { rows, error: null }
  } catch (error) {
    return { rows, error: error instanceof Error ? error.message : 'Query failed' }
  }
}

function balanceDescription(balance: number): string {
  if (balance > 0) return 'Amount Owed by Customer'
  if (balance < 0) return 'Credit / Advance Balance'
  return 'Settled'
}

function balanceColor(balance: number): string {
  if (balance > 0) return 'text-red-600'
  if (balance < 0) return 'text-green-600'
  return 'text-slate-900'
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { profile } = await getAuthedProfile()
  if (!profile || profile.status !== 'active' || !profile.organization_id) redirect('/login')
  const financeAccess = await getRoleAccess(profile.organization_id, profile.role)
  if (financeAccess.finance === 'none') redirect('/dashboard?error=unauthorized')

  const orgId = profile.organization_id
  // Opening receivables trail the hand-maintained Database type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const customersRaw = await fetchAllCustomers(
    supabase,
    'id, full_name, mobile_number, company_name',
    { activeOnly: false },
  )
  const customers = (customersRaw ?? []) as unknown as Array<{
    id: string
    full_name: string
    mobile_number: string
    company_name: string | null
  }>

  const customerId = typeof params.customer_id === 'string' ? params.customer_id : ''
  const { fromDate, toDate, error: dateRangeError } = resolveLedgerDateRange(
    params.from_date,
    params.to_date,
  )
  const selectedCustomer = customerId
    ? customers.find((customer) => customer.id === customerId) ?? null
    : null

  // Migration 055 is intentionally consumed through this narrow local shape;
  // generated/hand-maintained database types can be updated separately.
  type PostingRow = {
    id: string
    posting_date: string | null
    document_date: string | null
    posting_sequence: number | null
    event_type: string
    debit_amount: number | null
    credit_amount: number | null
    reference_number: string | null
    description: string | null
    provenance: 'live' | 'inferred' | null
    reversal_of: string | null
  }

  let events: CustomerLedgerEvent[] = []
  const failedSources: string[] = []

  // The selector is built from the authenticated tenant's customer list. Refuse to
  // query a guessed ID that is not in that list before touching financial history.
  if (selectedCustomer) {
    const postingResult = await fetchAllPages<PostingRow>((from, to) => admin
      .from('accounting_postings')
      .select('id, posting_date, document_date, posting_sequence, event_type, debit_amount, credit_amount, reference_number, description, provenance, reversal_of')
      .eq('organization_id', orgId)
      .eq('ledger', 'ar')
      .eq('party_id', customerId)
      .order('posting_date')
      .order('posting_sequence')
      .order('id')
      .range(from, to))

    if (postingResult.error) {
      failedSources.push(`accounting postings: ${postingResult.error}`)
    }

    const malformed = postingResult.rows.filter((posting) => (
      !posting.posting_date
      || !Number.isSafeInteger(Number(posting.posting_sequence))
      || !posting.provenance
    ))
    if (malformed.length > 0) {
      failedSources.push(`accounting postings: ${malformed.length} row${malformed.length === 1 ? '' : 's'} missing posting metadata`)
    }

    const allowedTypes = new Set<CustomerLedgerEvent['type']>([
      'opening_balance',
      'invoice',
      'credit_note',
      'payment',
      'advance',
      'refund',
      'write_off',
      'adjustment',
      'reversal',
    ])

    events = postingResult.rows
      .filter((posting) => (
        Boolean(posting.posting_date)
        && Number.isSafeInteger(Number(posting.posting_sequence))
        && Boolean(posting.provenance)
        && allowedTypes.has(posting.event_type as CustomerLedgerEvent['type'])
      ))
      .map((posting) => ({
        sourceId: posting.id,
        date: posting.posting_date as string,
        documentDate: posting.document_date,
        description: posting.description
          || `${posting.event_type.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}${posting.reference_number ? ` — ${posting.reference_number}` : ''}`,
        type: posting.event_type as CustomerLedgerEvent['type'],
        reference: posting.reference_number,
        debit: Number(posting.debit_amount ?? 0),
        credit: Number(posting.credit_amount ?? 0),
        sequence: Number(posting.posting_sequence),
        provenance: posting.provenance as 'live' | 'inferred',
        reversalOf: posting.reversal_of,
      }))
  }

  const ledger = buildCustomerLedger(events, { from: fromDate, to: toDate })
  const hasPeriodFilter = Boolean(fromDate || toDate)
  const displayRows = ledger.rows
  const currentBalance = ledger.currentBalance
  const periodClosingBalance = ledger.periodClosingBalance

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead
          title="Customer Ledger"
          subtitle={selectedCustomer
            ? `Account Statement — ${selectedCustomer.full_name}${hasPeriodFilter ? ` — ${fromDate || 'Beginning'} to ${toDate || 'Present'}` : ''}`
            : 'Account Statement'}
        />
      </div>
      <div className="print:hidden">
        <Header
          title="Customer Ledger"
          subtitle="Account statement & transaction history"
          actions={<PrintActions />}
        />
      </div>

      <div className="p-6 space-y-5">
        <LedgerCustomerSelector
          customers={customers}
          selectedId={customerId}
          fromDate={fromDate}
          toDate={toDate}
        />

        {dateRangeError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 print:hidden">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p className="text-sm font-medium">{dateRangeError}</p>
            </div>
          </div>
        )}

        {customerId && !selectedCustomer && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <p className="text-amber-700 font-medium">Customer not found</p>
          </div>
        )}

        {selectedCustomer && (
          <>
            {failedSources.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">This statement is incomplete</p>
                    <p className="mt-0.5 text-xs">
                      Could not load {failedSources.join('; ')}. Totals below should not be relied on until the data reloads successfully.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className={`rounded-xl border p-5 ${currentBalance > 0 ? 'bg-red-50 border-red-200' : currentBalance < 0 ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
              <div className="flex flex-wrap items-center justify-between gap-5">
                <div>
                  <p className="font-semibold text-slate-900">{selectedCustomer.full_name}</p>
                  <p className="text-sm text-slate-500">{selectedCustomer.mobile_number}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {displayRows.length} transaction{displayRows.length !== 1 ? 's' : ''}{hasPeriodFilter ? ' in selected period' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-8 text-right">
                  {hasPeriodFilter && (
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Period Closing Balance</p>
                      <p className={`text-xl font-bold ${balanceColor(periodClosingBalance)}`}>
                        {formatCurrency(Math.abs(periodClosingBalance))}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{balanceDescription(periodClosingBalance)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Current Balance (All Time)</p>
                    <p className={`text-2xl font-bold ${balanceColor(currentBalance)}`}>
                      {formatCurrency(Math.abs(currentBalance))}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{balanceDescription(currentBalance)}</p>
                  </div>
                </div>
              </div>
            </div>

            {displayRows.length === 0 && !fromDate ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
                <FileBarChart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">
                  {hasPeriodFilter ? 'No transactions in the selected period' : 'No transactions found'}
                </p>
                <p className="text-slate-400 text-sm mt-1">
                  {hasPeriodFilter
                    ? 'Try a different date range or view the all-time statement.'
                    : 'Invoices and payments for this customer will appear here.'}
                </p>
              </div>
            ) : (
              <div className="print-statement bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Posting Date</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Description</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Type</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Debit (KWD)</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Credit (KWD)</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Balance (KWD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {fromDate && (
                      <tr className="bg-blue-50">
                        <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">
                          {ledger.periodOpeningDate ? formatDate(ledger.periodOpeningDate) : '—'}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-blue-700">Opening Balance b/f</td>
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                            Balance b/f
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-red-600">
                          {ledger.periodOpeningBalance > 0 ? formatCurrency(ledger.periodOpeningBalance) : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-green-600">
                          {ledger.periodOpeningBalance < 0 ? formatCurrency(Math.abs(ledger.periodOpeningBalance)) : '—'}
                        </td>
                        <td className={`px-5 py-3.5 text-right font-bold ${balanceColor(ledger.periodOpeningBalance)}`}>
                          {formatCurrency(Math.abs(ledger.periodOpeningBalance))}
                        </td>
                      </tr>
                    )}
                    {displayRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">
                          <p>{formatDate(row.date)}</p>
                          {row.provenance === 'inferred' && (
                            <span className="mt-1 inline-flex rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              Inferred legacy date
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-slate-800">{row.description}</p>
                          {row.documentDate && row.documentDate !== row.date && (
                            <p className="mt-0.5 text-xs text-slate-400">Document date: {formatDate(row.documentDate)}</p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                            row.type === 'invoice' ? 'bg-blue-50 text-blue-700' :
                            row.type === 'credit_note' ? 'bg-teal-50 text-teal-700' :
                            row.type === 'payment' ? 'bg-green-50 text-green-700' :
                            row.type === 'opening_balance' ? 'bg-purple-50 text-purple-700' :
                            row.type === 'reversal' ? 'bg-red-50 text-red-700' :
                            'bg-amber-50 text-amber-700'
                          }`}>
                            {row.type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-red-600">
                          {row.debit > 0 ? formatCurrency(row.debit) : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-green-600">
                          {row.credit > 0 ? formatCurrency(row.credit) : '—'}
                        </td>
                        <td className={`px-5 py-3.5 text-right font-bold ${balanceColor(row.runningBalance)}`}>
                          {formatCurrency(Math.abs(row.runningBalance))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={3} className="px-5 py-3.5 text-sm font-bold text-slate-700">
                        {hasPeriodFilter ? 'Period Totals' : 'Totals'}
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm font-bold text-red-600">
                        {formatCurrency(hasPeriodFilter ? ledger.periodDebit : ledger.totalDebit)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm font-bold text-green-600">
                        {formatCurrency(hasPeriodFilter ? ledger.periodCredit : ledger.totalCredit)}
                      </td>
                      <td className={`px-5 py-3.5 text-right text-sm font-bold ${balanceColor(hasPeriodFilter ? periodClosingBalance : currentBalance)}`}>
                        {formatCurrency(Math.abs(hasPeriodFilter ? periodClosingBalance : currentBalance))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                </div>
              </div>
            )}
          </>
        )}

        {!customerId && (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
            <FileBarChart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Select a customer to view their ledger</p>
            <p className="text-slate-400 text-sm mt-1">Shows all invoices and payments with a running balance.</p>
          </div>
        )}
      </div>
    </div>
  )
}
