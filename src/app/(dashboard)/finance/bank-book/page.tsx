import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Landmark, TrendingUp, TrendingDown } from 'lucide-react'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { Suspense } from 'react'
import { fetchAllAssetDisposalsForBook } from '@/lib/assets.server'
import { getAuthedProfile } from '@/lib/auth/session'
import { getRoleAccess } from '@/lib/orgPermissions'
import { readPagedRows } from '@/lib/reportPaging'
import { BANK_MODES, buildBankBook, type BankBookSources } from './bankBook'

export const metadata = { title: 'Bank Book' }

export default async function BankBookPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })
  const allTime = !params.from && !params.to
  const from = params.from ?? today
  const to = params.to ?? today

  const { profile } = await getAuthedProfile()
  if (!profile || profile.status !== 'active') return null
  const financeAccess = await getRoleAccess(profile.organization_id, profile.role)
  if (financeAccess.finance === 'none') return null

  // The hand-maintained Database type does not include several finance tables
  // and relationships loaded by the books below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const financeDb = supabase as any
  const { data: orgRaw, error: orgError } = await financeDb
    .from('organizations')
    .select('id, opening_bank_balance, opening_balance_date')
    .eq('id', profile.organization_id)
    .single()
  if (orgError) {
    throw new Error(`Could not load Bank Book opening balance: ${orgError.message}`)
  }
  const org = (orgRaw ?? {}) as {
    id: string | null
    opening_bank_balance: number | null
    opening_balance_date: string | null
  }
  const openingBank = org.opening_bank_balance ?? 0
  const openingDate = org.opening_balance_date ?? null
  const sourceFailures: string[] = []

  const paged = <T,>(
    source: string,
    buildQuery: (rangeFrom: number, rangeTo: number) => PromiseLike<{
      data: T[] | null
      error: { message?: string } | null
    }>,
  ) => readPagedRows<T>(buildQuery, sourceFailures, source)

  // Every source is explicitly paged. PostgREST caps responses at 1,000 rows,
  // even when a larger limit is requested; an oldest-first one-shot query hid
  // the newest Bank Book receipts once payments crossed that threshold.
  const [
    receipts,
    supplierPayments,
    supplierAdvances,
    expenses,
    salaries,
    advances,
    repayments,
    amcPayments,
    transfers,
    withdrawals,
    bonuses,
  ] = await Promise.all([
    paged<BankBookSources['receipts'][number]>('customer payments', (rangeFrom, rangeTo) => financeDb
      .from('payments')
      .select('id, payment_date, payment_number, amount_received, payment_mode, reference_number, customers(full_name)')
      .eq('organization_id', profile.organization_id)
      .in('payment_mode', BANK_MODES)
      .eq('is_cancelled', false)
      .gt('amount_received', 0)
      .order('payment_date', { ascending: true })
      .order('id', { ascending: true })
      .range(rangeFrom, rangeTo)),
    paged<BankBookSources['supplierPayments'][number]>('supplier payments', (rangeFrom, rangeTo) => financeDb
      .from('supplier_payments')
      .select('id, payment_date, amount_paid, payment_mode, reference_number, suppliers(supplier_name)')
      .eq('organization_id', profile.organization_id)
      .in('payment_mode', BANK_MODES)
      .eq('is_cancelled', false)
      .is('supplier_advance_id', null)
      .gt('amount_paid', 0)
      .order('payment_date', { ascending: true })
      .order('id', { ascending: true })
      .range(rangeFrom, rangeTo)),
    paged<BankBookSources['supplierAdvances'][number]>('supplier advances', (rangeFrom, rangeTo) => financeDb
      .from('supplier_advances')
      .select('id, advance_date, amount, payment_mode, reference_number, suppliers(supplier_name)')
      .eq('organization_id', profile.organization_id)
      .in('payment_mode', BANK_MODES)
      .eq('is_cancelled', false)
      .order('advance_date', { ascending: true })
      .order('id', { ascending: true })
      .range(rangeFrom, rangeTo)),
    paged<BankBookSources['expenses'][number]>('expenses', (rangeFrom, rangeTo) => financeDb
      .from('expenses')
      .select('id, expense_date, expense_number, category, description, amount, payment_method, reference_number')
      .eq('organization_id', profile.organization_id)
      .in('payment_method', ['bank_transfer', 'cheque'])
      .order('expense_date', { ascending: true })
      .order('id', { ascending: true })
      .range(rangeFrom, rangeTo)),
    paged<BankBookSources['salaries'][number]>('salary payments', (rangeFrom, rangeTo) => financeDb
      .from('salary_slips')
      .select('id, payment_date, net_salary, payment_mode, staff(full_name), salary_runs(salary_month, salary_year)')
      .eq('organization_id', profile.organization_id)
      .eq('payment_status', 'paid')
      .in('payment_mode', BANK_MODES)
      .order('payment_date', { ascending: true })
      .order('id', { ascending: true })
      .range(rangeFrom, rangeTo)),
    paged<BankBookSources['advances'][number]>('staff advances', (rangeFrom, rangeTo) => financeDb
      .from('staff_advances')
      .select('id, issued_date, type, amount, payment_method, notes, settlement_recovery_amount, staff(full_name)')
      .eq('organization_id', profile.organization_id)
      .in('payment_method', ['bank', 'bank_transfer', 'cheque'])
      .order('issued_date', { ascending: true })
      .order('id', { ascending: true })
      .range(rangeFrom, rangeTo)),
    paged<BankBookSources['repayments'][number]>('staff advance repayments', (rangeFrom, rangeTo) => financeDb
      .from('staff_advance_repayments')
      .select('id, repayment_date, amount, notes, staff(full_name)')
      .eq('organization_id', profile.organization_id)
      .eq('payment_method', 'bank')
      .order('repayment_date', { ascending: true })
      .order('id', { ascending: true })
      .range(rangeFrom, rangeTo)),
    paged<BankBookSources['amcPayments'][number]>('AMC payments', (rangeFrom, rangeTo) => financeDb
      .from('amc_payments')
      .select('id, payment_date, amount, payment_mode, reference_number, amc_contracts(contract_number, customers(full_name))')
      .eq('organization_id', profile.organization_id)
      .in('payment_mode', BANK_MODES)
      .eq('is_pre_opening', false)
      .order('payment_date', { ascending: true })
      .order('id', { ascending: true })
      .range(rangeFrom, rangeTo)),
    paged<BankBookSources['transfers'][number]>('fund transfers', (rangeFrom, rangeTo) => financeDb
      .from('fund_transfers')
      .select('id, transfer_date, from_account, to_account, amount, reference_number, notes')
      .eq('organization_id', profile.organization_id)
      .order('transfer_date', { ascending: true })
      .order('id', { ascending: true })
      .range(rangeFrom, rangeTo)),
    paged<BankBookSources['withdrawals'][number]>('owner withdrawals', (rangeFrom, rangeTo) => financeDb
      .from('owner_withdrawals')
      .select('id, withdrawal_date, amount, payment_mode, purpose, notes')
      .eq('organization_id', profile.organization_id)
      .in('payment_mode', BANK_MODES)
      .order('withdrawal_date', { ascending: true })
      .order('id', { ascending: true })
      .range(rangeFrom, rangeTo)),
    paged<BankBookSources['bonuses'][number]>('staff bonuses', (rangeFrom, rangeTo) => financeDb
      .from('staff_bonuses')
      .select('id, bonus_date, amount, payment_mode, notes, staff(full_name)')
      .eq('organization_id', profile.organization_id)
      .in('payment_mode', BANK_MODES)
      .eq('is_voided', false)
      .order('bonus_date', { ascending: true })
      .order('id', { ascending: true })
      .range(rangeFrom, rangeTo)),
  ])

  // Asset RLS is narrower than Finance access, so load only this book's
  // disposal receipts through the service role after explicitly authorizing the
  // active caller, tenant and effective Finance permission.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  let assetDisposals: BankBookSources['assetDisposals'] = []
  try {
    assetDisposals = await fetchAllAssetDisposalsForBook(
      admin,
      profile.organization_id,
      ['bank_transfer', 'cheque'],
      openingDate,
    )
  } catch (error) {
    sourceFailures.push(`asset disposals: ${error instanceof Error ? error.message : 'query failed'}`)
  }

  const book = buildBankBook({
    receipts,
    supplierPayments,
    supplierAdvances,
    expenses,
    salaries,
    advances,
    repayments,
    amcPayments,
    transfers,
    withdrawals,
    bonuses,
    assetDisposals,
  }, {
    openingBank,
    openingDate,
    from,
    to,
    allTime,
  })

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Bank Book" subtitle={allTime ? 'All Time' : `${formatDate(from)} to ${formatDate(to)}`} />
      </div>
      <Header title="Bank Book" subtitle="All bank receipts and payments" actions={<div className="flex items-center gap-2"><RefreshButton /><PrintActions /></div>} />

      <div className="p-6 space-y-5">
        {sourceFailures.length > 0 && (
          <div className="print:hidden rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <strong>These figures are incomplete.</strong> Could not fully load: {sourceFailures.join(', ')}.
          </div>
        )}
        <div className="print:hidden">
          <Suspense>
            <DateRangeFilter basePath="/finance/bank-book" from={params.from} to={params.to} />
          </Suspense>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Period Receipts</p>
            </div>
            <p className="text-xl font-bold text-green-600">{formatCurrency(book.periodReceipts)}</p>
            <p className="text-xs text-slate-400 mt-1">{allTime ? 'All time' : `${formatDate(from)} – ${formatDate(to)}`}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Period Payments</p>
            </div>
            <p className="text-xl font-bold text-red-500">{formatCurrency(book.periodPayments)}</p>
            <p className="text-xs text-slate-400 mt-1">{allTime ? 'All time' : `${formatDate(from)} – ${formatDate(to)}`}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Landmark className="w-4 h-4 text-blue-600" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Closing Balance</p>
            </div>
            <p className={`text-xl font-bold ${book.closingBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {formatCurrency(book.closingBalance)}
            </p>
            <p className="text-xs text-slate-400 mt-1">Opening {formatCurrency(openingBank)} + {formatCurrency(book.totalBankIn)} in − {formatCurrency(book.totalBankOut)} out</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Bank Transactions</h3>
            <span className="text-xs text-slate-500">
              {book.entries.length} entries · {allTime ? 'All time' : `${formatDate(from)} to ${formatDate(to)}`}
            </span>
          </div>
          {book.entries.length === 0 ? (
            <div className="p-10 text-center">
              <Landmark className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No bank transactions in this period</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[750px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Date</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Narration</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Mode</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Ref</th>
                    <th className="text-right text-xs font-semibold text-green-700 uppercase tracking-wider px-4 py-3">Receipts</th>
                    <th className="text-right text-xs font-semibold text-red-600 uppercase tracking-wider px-4 py-3">Payments</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(() => {
                    let running = book.periodOpeningBalance
                    return [
                      <tr key="opening" className="bg-blue-50">
                        <td className="px-5 py-3 text-sm text-slate-500 whitespace-nowrap">{book.periodOpeningDate ? formatDate(book.periodOpeningDate) : '—'}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-blue-700">Opening Balance b/f</td>
                        <td className="px-4 py-3"><span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Opening</span></td>
                        <td className="px-4 py-3 text-xs text-slate-400 font-mono">—</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-blue-700">{formatCurrency(book.periodOpeningBalance)}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-400">—</td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-blue-700">{formatCurrency(book.periodOpeningBalance)}</td>
                      </tr>,
                      ...book.entries.map((entry) => {
                        running += entry.receipts - entry.payments
                        return (
                          <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(entry.date)}</td>
                            <td className="px-4 py-3 text-sm text-slate-800">{entry.narration}</td>
                            <td className="px-4 py-3">
                              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{entry.mode}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400 font-mono">{entry.ref}</td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-green-700">
                              {entry.receipts > 0 ? formatCurrency(entry.receipts) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-red-600">
                              {entry.payments > 0 ? formatCurrency(entry.payments) : '—'}
                            </td>
                            <td className={`px-5 py-3 text-right text-sm font-bold ${running >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
                              {formatCurrency(running)}
                            </td>
                          </tr>
                        )
                      }),
                    ]
                  })()}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={4} className="px-5 py-3 text-sm font-bold text-slate-700">Period Total</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-700">{formatCurrency(book.periodReceipts)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(book.periodPayments)}</td>
                    {(() => { const periodBalance = book.periodOpeningBalance + book.periodReceipts - book.periodPayments; return (
                      <td className={`px-5 py-3 text-right text-sm font-bold ${periodBalance >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                        {formatCurrency(periodBalance)}
                      </td>
                    )})()}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
