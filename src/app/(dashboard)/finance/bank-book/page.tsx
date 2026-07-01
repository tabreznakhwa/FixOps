import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Landmark, TrendingUp, TrendingDown } from 'lucide-react'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { Suspense } from 'react'

export const metadata = { title: 'Bank Book' }

const BANK_MODES = ['bank_transfer', 'cheque', 'pos', 'online', 'card']
const MODE_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer', cheque: 'Cheque', pos: 'POS',
  online: 'Online', card: 'Card',
}

export default async function BankBookPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const today = new Date().toISOString().split('T')[0]
  const allTime = !params.from && !params.to
  const from = params.from ?? today
  const to = params.to ?? today

  // Opening balance
  const { data: orgRaw } = await (supabase as any)
    .from('organizations').select('opening_bank_balance, opening_balance_date').limit(1).single()
  const org = (orgRaw ?? {}) as { opening_bank_balance: number | null; opening_balance_date: string | null }
  const openingBank = org.opening_bank_balance ?? 0
  const openingDate = org.opening_balance_date ?? null

  // Period-filtered queries for the transaction table
  const baseReceiptsQ = (supabase as any)
    .from('payments')
    .select('id, payment_date, payment_number, amount_received, payment_mode, reference_number, customers(full_name)')
    .in('payment_mode', BANK_MODES)
    .eq('is_cancelled', false)
    .order('payment_date', { ascending: true })
  const { data: receiptsRaw } = await (allTime ? baseReceiptsQ : baseReceiptsQ.gte('payment_date', from).lte('payment_date', to))

  const basePaymentsQ = (supabase as any)
    .from('supplier_payments')
    .select('id, payment_date, amount_paid, payment_mode, reference_number, suppliers(supplier_name)')
    .in('payment_mode', BANK_MODES)
    .order('payment_date', { ascending: true })
  const { data: paymentsRaw } = await (allTime ? basePaymentsQ : basePaymentsQ.gte('payment_date', from).lte('payment_date', to))

  const baseExpensesQ = (supabase as any)
    .from('expenses')
    .select('id, expense_date, expense_number, category, description, amount, payment_method, reference_number')
    .in('payment_method', ['bank_transfer', 'cheque'])
    .order('expense_date', { ascending: true })
  const { data: expensesRaw } = await (allTime ? baseExpensesQ : baseExpensesQ.gte('expense_date', from).lte('expense_date', to))

  const baseSalaryQ = (supabase as any)
    .from('salary_slips')
    .select('id, payment_date, net_salary, payment_mode, staff(full_name), salary_runs(salary_month, salary_year)')
    .eq('payment_status', 'paid')
    .in('payment_mode', BANK_MODES)
    .order('payment_date', { ascending: true })
  const { data: salaryRaw } = await (allTime ? baseSalaryQ : baseSalaryQ.gte('payment_date', from).lte('payment_date', to))

  // All-time totals for the closing balance card (always shows current running balance)
  const [{ data: atR }, { data: atP }, { data: atE }, { data: atS }] = await Promise.all([
    (supabase as any).from('payments').select('amount_received').in('payment_mode', BANK_MODES).eq('is_cancelled', false),
    (supabase as any).from('supplier_payments').select('amount_paid').in('payment_mode', BANK_MODES),
    (supabase as any).from('expenses').select('amount').in('payment_method', ['bank_transfer', 'cheque']),
    (supabase as any).from('salary_slips').select('net_salary').eq('payment_status', 'paid').in('payment_mode', BANK_MODES),
  ])
  const allTimeReceipts = ((atR ?? []) as Array<{ amount_received: number }>).reduce((s: number, r: { amount_received: number }) => s + r.amount_received, 0)
  const allTimeOut = ((atP ?? []) as Array<{ amount_paid: number }>).reduce((s: number, r: { amount_paid: number }) => s + r.amount_paid, 0)
    + ((atE ?? []) as Array<{ amount: number }>).reduce((s: number, r: { amount: number }) => s + r.amount, 0)
    + ((atS ?? []) as Array<{ net_salary: number }>).reduce((s: number, r: { net_salary: number }) => s + r.net_salary, 0)
  const closingBalance = openingBank + allTimeReceipts - allTimeOut

  const CATEGORY_LABELS: Record<string, string> = {
    rent: 'Rent', electricity: 'Electricity', water: 'Water', phone: 'Phone / Mobile',
    internet: 'Internet', stationery: 'Stationery & Office', fuel: 'Fuel & Transport',
    vehicle_maintenance: 'Vehicle Maintenance', tools_equipment: 'Tools & Equipment',
    marketing: 'Marketing', bank_charges: 'Bank Charges', insurance: 'Insurance',
    professional_services: 'Professional Services', food_entertainment: 'Food & Refreshments',
    other: 'Miscellaneous',
  }
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const receipts = (receiptsRaw ?? []) as Array<{
    id: string; payment_date: string; payment_number: string; amount_received: number
    payment_mode: string; reference_number: string | null
    customers: { full_name: string } | null
  }>
  const payments = (paymentsRaw ?? []) as Array<{
    id: string; payment_date: string; amount_paid: number
    payment_mode: string; reference_number: string | null
    suppliers: { supplier_name: string } | null
  }>
  const expenses = (expensesRaw ?? []) as Array<{
    id: string; expense_date: string; expense_number: string; category: string
    description: string; amount: number; payment_method: string; reference_number: string | null
  }>
  const salaries = (salaryRaw ?? []) as Array<{
    id: string; payment_date: string; net_salary: number; payment_mode: string
    staff: { full_name: string } | null
    salary_runs: { salary_month: number; salary_year: number } | null
  }>

  type Entry = { date: string; narration: string; mode: string; receipts: number; payments: number; ref: string }
  const entries: Entry[] = [
    ...receipts.map((r) => ({
      date: r.payment_date,
      narration: `Receipt — ${r.customers?.full_name ?? 'Customer'} (${r.payment_number})`,
      mode: MODE_LABELS[r.payment_mode] ?? r.payment_mode,
      receipts: r.amount_received, payments: 0,
      ref: r.reference_number ?? '—',
    })),
    ...payments.map((p) => ({
      date: p.payment_date,
      narration: `Payment — ${p.suppliers?.supplier_name ?? 'Supplier'}`,
      mode: MODE_LABELS[p.payment_mode] ?? p.payment_mode,
      receipts: 0, payments: p.amount_paid,
      ref: p.reference_number ?? '—',
    })),
    ...salaries.map((s) => {
      const run = s.salary_runs
      const period = run ? `${MONTHS[run.salary_month - 1]} ${run.salary_year}` : ''
      return {
        date: s.payment_date,
        narration: `Salary — ${s.staff?.full_name ?? 'Staff'}${period ? ` (${period})` : ''}`,
        mode: MODE_LABELS[s.payment_mode] ?? s.payment_mode,
        receipts: 0, payments: s.net_salary, ref: '—',
      }
    }),
    ...expenses.map((e) => ({
      date: e.expense_date,
      narration: `Expense — ${CATEGORY_LABELS[e.category] ?? e.category}: ${e.description}`,
      mode: e.payment_method === 'cheque' ? 'Cheque' : 'Bank Transfer',
      receipts: 0, payments: e.amount,
      ref: e.reference_number ?? e.expense_number,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const periodReceipts = entries.reduce((s, e) => s + e.receipts, 0)
  const periodPayments = entries.reduce((s, e) => s + e.payments, 0)

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Bank Book" subtitle={allTime ? 'All Time' : `${formatDate(from)} to ${formatDate(to)}`} />
      </div>
      <Header title="Bank Book" subtitle="All bank receipts and payments" actions={<PrintActions />} />

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
            <p className="text-xs text-slate-400 mt-1">All-time running total</p>
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
                    let running = openingBank
                    return [
                      ...(openingBank > 0 ? [(
                        <tr key="opening" className="bg-blue-50">
                          <td className="px-5 py-3 text-sm text-slate-500 whitespace-nowrap">{openingDate ? formatDate(openingDate) : '—'}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-blue-700">Opening Balance b/f</td>
                          <td className="px-4 py-3"><span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Opening</span></td>
                          <td className="px-4 py-3 text-xs text-slate-400 font-mono">—</td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-blue-700">{formatCurrency(openingBank)}</td>
                          <td className="px-4 py-3 text-right text-sm text-slate-400">—</td>
                          <td className="px-5 py-3 text-right text-sm font-bold text-blue-700">{formatCurrency(openingBank)}</td>
                        </tr>
                      )] : []),
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
                    <td className={`px-5 py-3 text-right text-sm font-bold ${closingBalance >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                      {formatCurrency(closingBalance)}
                    </td>
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
