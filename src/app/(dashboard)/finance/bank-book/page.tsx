import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Landmark, TrendingUp, TrendingDown } from 'lucide-react'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { Suspense } from 'react'

export const metadata = { title: 'Bank Book' }

const BANK_MODES = ['bank_transfer', 'cheque', 'pos', 'online', 'card', 'knet']
const MODE_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer', cheque: 'Cheque', pos: 'POS',
  online: 'Online', card: 'Card', knet: 'KNET',
}
const CATEGORY_LABELS: Record<string, string> = {
  rent: 'Rent', electricity: 'Electricity', water: 'Water', phone: 'Phone / Mobile',
  internet: 'Internet', stationery: 'Stationery & Office', fuel: 'Fuel & Transport',
  vehicle_maintenance: 'Vehicle Maintenance', tools_equipment: 'Tools & Equipment',
  marketing: 'Marketing', bank_charges: 'Bank Charges', insurance: 'Insurance',
  professional_services: 'Professional Services', food_entertainment: 'Food & Refreshments',
  travel: 'Travel Expense', other: 'Miscellaneous',
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

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

  // Opening balance
  const { data: orgRaw } = await (supabase as any)
    .from('organizations').select('opening_bank_balance, opening_balance_date').limit(1).single()
  const org = (orgRaw ?? {}) as { opening_bank_balance: number | null; opening_balance_date: string | null }
  const openingBank = org.opening_bank_balance ?? 0
  const openingDate = org.opening_balance_date ?? null

  // Fetch ALL historical data in one pass — closing balance is always all-time
  // Client-side filtering handles the period view for the table
  const { data: allReceiptsRaw } = await (supabase as any)
    .from('payments')
    .select('payment_date, payment_number, amount_received, payment_mode, reference_number, customers(full_name)')
    .in('payment_mode', BANK_MODES)
    .eq('is_cancelled', false)
    .order('payment_date', { ascending: true })
    .limit(5000)

  const { data: allSupplierPaymentsRaw } = await (supabase as any)
    .from('supplier_payments')
    .select('payment_date, amount_paid, payment_mode, reference_number, suppliers(supplier_name)')
    .in('payment_mode', BANK_MODES)
    .order('payment_date', { ascending: true })
    .limit(5000)

  const { data: allExpensesRaw } = await (supabase as any)
    .from('expenses')
    .select('expense_date, expense_number, category, description, amount, payment_method, reference_number')
    .in('payment_method', ['bank_transfer', 'cheque'])
    .order('expense_date', { ascending: true })
    .limit(5000)

  const { data: allSalariesRaw } = await (supabase as any)
    .from('salary_slips')
    .select('payment_date, net_salary, payment_mode, staff(full_name), salary_runs(salary_month, salary_year)')
    .eq('payment_status', 'paid')
    .in('payment_mode', BANK_MODES)
    .order('payment_date', { ascending: true })
    .limit(5000)

  const { data: allAdvancesRaw } = await (supabase as any)
    .from('staff_advances')
    .select('issued_date, type, amount, notes, staff(full_name)')
    .eq('payment_method', 'bank')
    .order('issued_date', { ascending: true })
    .limit(5000)

  const { data: allRepaymentsRaw } = await (supabase as any)
    .from('staff_advance_repayments')
    .select('repayment_date, amount, notes, staff(full_name)')
    .eq('payment_method', 'bank')
    .order('repayment_date', { ascending: true })
    .limit(5000)

  const { data: allAmcPaymentsRaw } = await (supabase as any)
    .from('amc_payments')
    .select('payment_date, amount, payment_mode, reference_number, amc_contracts(contract_number, customers(full_name))')
    .in('payment_mode', BANK_MODES)
    .eq('is_pre_opening', false)
    .order('payment_date', { ascending: true })
    .limit(5000)

  const { data: allTransfersRaw } = await (supabase as any)
    .from('fund_transfers')
    .select('transfer_date, from_account, to_account, amount, reference_number, notes')
    .order('transfer_date', { ascending: true })
    .limit(5000)

  const { data: allWithdrawalsRaw } = await (supabase as any)
    .from('owner_withdrawals')
    .select('withdrawal_date, amount, payment_mode, purpose, notes')
    .in('payment_mode', ['bank_transfer', 'cheque', 'pos', 'card', 'online'])
    .order('withdrawal_date', { ascending: true })
    .limit(5000)

  type Receipt = { payment_date: string; payment_number: string; amount_received: number; payment_mode: string; reference_number: string | null; customers: { full_name: string } | null }
  type SupplierPay = { payment_date: string; amount_paid: number; payment_mode: string; reference_number: string | null; suppliers: { supplier_name: string } | null }
  type Expense = { expense_date: string; expense_number: string; category: string; description: string; amount: number; payment_method: string; reference_number: string | null }
  type Salary = { payment_date: string; net_salary: number; payment_mode: string; staff: { full_name: string } | null; salary_runs: { salary_month: number; salary_year: number } | null }
  type AdvancePay = { issued_date: string; type: string; amount: number; notes: string | null; staff: { full_name: string } | null }
  type RepaymentPay = { repayment_date: string; amount: number; notes: string | null; staff: { full_name: string } | null }
  type AmcPay = { payment_date: string; amount: number; payment_mode: string; reference_number: string | null; amc_contracts: { contract_number: string; customers: { full_name: string } | null } | null }
  type Transfer = { transfer_date: string; from_account: string; to_account: string; amount: number; reference_number: string | null; notes: string | null }
  type Withdrawal = { withdrawal_date: string; amount: number; payment_mode: string; purpose: string | null; notes: string | null }

  const allReceipts = (allReceiptsRaw ?? []) as Receipt[]
  const allSupplierPayments = (allSupplierPaymentsRaw ?? []) as SupplierPay[]
  const allExpenses = (allExpensesRaw ?? []) as Expense[]
  const allSalaries = (allSalariesRaw ?? []) as Salary[]
  const allAdvances = (allAdvancesRaw ?? []) as AdvancePay[]
  const allRepayments = (allRepaymentsRaw ?? []) as RepaymentPay[]
  const allAmcPayments = (allAmcPaymentsRaw ?? []) as AmcPay[]
  const allTransfers = (allTransfersRaw ?? []) as Transfer[]
  const allWithdrawals = (allWithdrawalsRaw ?? []) as Withdrawal[]

  // Bank transfers: cash→bank = receipt, bank→cash = payment
  const bankTransfersIn = allTransfers.filter(t => t.to_account === 'bank')
  const bankTransfersOut = allTransfers.filter(t => t.from_account === 'bank')

  // Closing balance is always the all-time running total
  const totalBankIn = allReceipts.reduce((s, r) => s + r.amount_received, 0)
    + allAmcPayments.reduce((s, p) => s + p.amount, 0)
    + bankTransfersIn.reduce((s, t) => s + t.amount, 0)
    + allRepayments.reduce((s, r) => s + r.amount, 0)
  const totalBankOut = allSupplierPayments.reduce((s, r) => s + r.amount_paid, 0)
    + allExpenses.reduce((s, r) => s + r.amount, 0)
    + allSalaries.reduce((s, r) => s + r.net_salary, 0)
    + allAdvances.reduce((s, r) => s + r.amount, 0)
    + bankTransfersOut.reduce((s, t) => s + t.amount, 0)
    + allWithdrawals.reduce((s, w) => s + w.amount, 0)
  const closingBalance = openingBank + totalBankIn - totalBankOut

  // "Opening Balance b/f" for the table = balance at the START of the selected period
  const prePeriodIn = allTime ? 0 : (
    allReceipts.filter((r) => r.payment_date < from).reduce((s, r) => s + r.amount_received, 0)
    + allAmcPayments.filter((p) => p.payment_date < from).reduce((s, p) => s + p.amount, 0)
    + bankTransfersIn.filter((t) => t.transfer_date < from).reduce((s, t) => s + t.amount, 0)
    + allRepayments.filter((r) => r.repayment_date < from).reduce((s, r) => s + r.amount, 0)
  )
  const prePeriodOut = allTime ? 0 : (
    allSupplierPayments.filter((p) => p.payment_date < from).reduce((s, p) => s + p.amount_paid, 0)
    + allExpenses.filter((e) => e.expense_date < from).reduce((s, e) => s + e.amount, 0)
    + allSalaries.filter((s) => s.payment_date < from).reduce((s2, s) => s2 + s.net_salary, 0)
    + allAdvances.filter((a) => a.issued_date < from).reduce((s, a) => s + a.amount, 0)
    + bankTransfersOut.filter((t) => t.transfer_date < from).reduce((s, t) => s + t.amount, 0)
    + allWithdrawals.filter((w) => w.withdrawal_date < from).reduce((s, w) => s + w.amount, 0)
  )
  const periodOpeningBalance = openingBank + prePeriodIn - prePeriodOut
  // Date label for the b/f row: one day before the period start
  const periodOpeningDate = allTime ? openingDate : (() => {
    const d = new Date(from); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]
  })()

  // Filter to selected period for the transaction table
  const inPeriod = (date: string) => allTime || (date >= from && date <= to)

  type Entry = { date: string; narration: string; mode: string; receipts: number; payments: number; ref: string }
  const entries: Entry[] = [
    ...allReceipts.filter((r) => inPeriod(r.payment_date)).map((r) => ({
      date: r.payment_date,
      narration: `Receipt — ${r.customers?.full_name ?? 'Customer'} (${r.payment_number})`,
      mode: MODE_LABELS[r.payment_mode] ?? r.payment_mode,
      receipts: r.amount_received, payments: 0,
      ref: r.reference_number ?? '—',
    })),
    ...allSupplierPayments.filter((p) => inPeriod(p.payment_date)).map((p) => ({
      date: p.payment_date,
      narration: `Payment — ${p.suppliers?.supplier_name ?? 'Supplier'}`,
      mode: MODE_LABELS[p.payment_mode] ?? p.payment_mode,
      receipts: 0, payments: p.amount_paid,
      ref: p.reference_number ?? '—',
    })),
    ...allSalaries.filter((s) => inPeriod(s.payment_date)).map((s) => {
      const run = s.salary_runs
      const period = run ? `${MONTHS[run.salary_month - 1]} ${run.salary_year}` : ''
      return {
        date: s.payment_date,
        narration: `Salary — ${s.staff?.full_name ?? 'Staff'}${period ? ` (${period})` : ''}`,
        mode: MODE_LABELS[s.payment_mode] ?? s.payment_mode,
        receipts: 0, payments: s.net_salary, ref: '—',
      }
    }),
    ...allExpenses.filter((e) => inPeriod(e.expense_date)).map((e) => ({
      date: e.expense_date,
      narration: `Expense — ${CATEGORY_LABELS[e.category] ?? e.category}: ${e.description}`,
      mode: e.payment_method === 'cheque' ? 'Cheque' : 'Bank Transfer',
      receipts: 0, payments: e.amount,
      ref: e.reference_number ?? e.expense_number,
    })),
    ...allAdvances.filter((a) => inPeriod(a.issued_date)).map((a) => ({
      date: a.issued_date,
      narration: `${a.type === 'loan' ? 'Loan' : 'Salary Advance'} — ${a.staff?.full_name ?? 'Staff'}${a.notes ? ` (${a.notes})` : ''}`,
      mode: 'Bank Transfer',
      receipts: 0, payments: a.amount,
      ref: '—',
    })),
    ...allRepayments.filter((r) => inPeriod(r.repayment_date)).map((r) => ({
      date: r.repayment_date,
      narration: `Loan/Advance Repayment — ${r.staff?.full_name ?? 'Staff'}${r.notes ? ` (${r.notes})` : ''}`,
      mode: 'Bank Transfer',
      receipts: r.amount, payments: 0,
      ref: '—',
    })),
    ...allAmcPayments.filter((p) => inPeriod(p.payment_date)).map((p) => ({
      date: p.payment_date,
      narration: `AMC Payment — ${p.amc_contracts?.contract_number ?? ''}${p.amc_contracts?.customers?.full_name ? ` (${p.amc_contracts.customers.full_name})` : ''}`,
      mode: MODE_LABELS[p.payment_mode] ?? p.payment_mode,
      receipts: p.amount, payments: 0,
      ref: p.reference_number ?? '—',
    })),
    ...bankTransfersIn.filter((t) => inPeriod(t.transfer_date)).map((t) => ({
      date: t.transfer_date,
      narration: `Transfer — Cash → Bank${t.notes ? ` (${t.notes})` : ''}`,
      mode: 'Transfer',
      receipts: t.amount, payments: 0,
      ref: t.reference_number ?? '—',
    })),
    ...bankTransfersOut.filter((t) => inPeriod(t.transfer_date)).map((t) => ({
      date: t.transfer_date,
      narration: `Transfer — Bank → Cash${t.notes ? ` (${t.notes})` : ''}`,
      mode: 'Transfer',
      receipts: 0, payments: t.amount,
      ref: t.reference_number ?? '—',
    })),
    ...allWithdrawals.filter((w) => inPeriod(w.withdrawal_date)).map((w) => ({
      date: w.withdrawal_date,
      narration: `Owner Withdrawal${w.purpose ? ` — ${w.purpose}` : ''}`,
      mode: MODE_LABELS[w.payment_mode] ?? w.payment_mode,
      receipts: 0, payments: w.amount,
      ref: '—',
    })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const periodReceipts = entries.reduce((s, e) => s + e.receipts, 0)
  const periodPayments = entries.reduce((s, e) => s + e.payments, 0)

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Bank Book" subtitle={allTime ? 'All Time' : `${formatDate(from)} to ${formatDate(to)}`} />
      </div>
      <Header title="Bank Book" subtitle="All bank receipts and payments" actions={<div className="flex items-center gap-2"><RefreshButton /><PrintActions /></div>} />

      <div className="p-6 space-y-5">
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
            <p className="text-xl font-bold text-green-600">{formatCurrency(periodReceipts)}</p>
            <p className="text-xs text-slate-400 mt-1">{allTime ? 'All time' : `${formatDate(from)} – ${formatDate(to)}`}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Period Payments</p>
            </div>
            <p className="text-xl font-bold text-red-500">{formatCurrency(periodPayments)}</p>
            <p className="text-xs text-slate-400 mt-1">{allTime ? 'All time' : `${formatDate(from)} – ${formatDate(to)}`}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Landmark className="w-4 h-4 text-blue-600" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Closing Balance</p>
            </div>
            <p className={`text-xl font-bold ${closingBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {formatCurrency(closingBalance)}
            </p>
            <p className="text-xs text-slate-400 mt-1">Opening {formatCurrency(openingBank)} + {formatCurrency(totalBankIn)} in − {formatCurrency(totalBankOut)} out</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Bank Transactions</h3>
            <span className="text-xs text-slate-500">
              {entries.length} entries · {allTime ? 'All time' : `${formatDate(from)} to ${formatDate(to)}`}
            </span>
          </div>
          {entries.length === 0 ? (
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
                    let running = periodOpeningBalance
                    return [
                      <tr key="opening" className="bg-blue-50">
                        <td className="px-5 py-3 text-sm text-slate-500 whitespace-nowrap">{periodOpeningDate ? formatDate(periodOpeningDate) : '—'}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-blue-700">Opening Balance b/f</td>
                        <td className="px-4 py-3"><span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Opening</span></td>
                        <td className="px-4 py-3 text-xs text-slate-400 font-mono">—</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-blue-700">{formatCurrency(periodOpeningBalance)}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-400">—</td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-blue-700">{formatCurrency(periodOpeningBalance)}</td>
                      </tr>,
                      ...entries.map((e, i) => {
                        running += e.receipts - e.payments
                        return (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(e.date)}</td>
                            <td className="px-4 py-3 text-sm text-slate-800">{e.narration}</td>
                            <td className="px-4 py-3">
                              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{e.mode}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400 font-mono">{e.ref}</td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-green-700">
                              {e.receipts > 0 ? formatCurrency(e.receipts) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-red-600">
                              {e.payments > 0 ? formatCurrency(e.payments) : '—'}
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
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-700">{formatCurrency(periodReceipts)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(periodPayments)}</td>
                    {(() => { const pb = periodOpeningBalance + periodReceipts - periodPayments; return (
                      <td className={`px-5 py-3 text-right text-sm font-bold ${pb >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                        {formatCurrency(pb)}
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
