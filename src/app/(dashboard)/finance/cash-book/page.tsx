import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Banknote, TrendingUp, TrendingDown } from 'lucide-react'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'

export const metadata = { title: 'Cash Book' }

export default async function CashBookPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 7) + '-01'
  const from = params.from ?? firstOfMonth
  const to = params.to ?? today

  // Fetch opening balance from org settings
  const { data: orgRaw } = await (supabase as any)
    .from('organizations').select('opening_cash_balance, opening_balance_date').limit(1).single()
  const org = (orgRaw ?? {}) as { opening_cash_balance: number | null; opening_balance_date: string | null }
  const openingCash = org.opening_cash_balance ?? 0
  const openingDate = org.opening_balance_date ?? null

  // Cash receipts from customers
  const { data: receiptsRaw } = await (supabase as any)
    .from('payments')
    .select('id, payment_date, payment_number, amount_received, reference_number, notes, customers(full_name)')
    .eq('payment_mode', 'cash')
    .eq('is_cancelled', false)
    .gte('payment_date', from)
    .lte('payment_date', to)
    .order('payment_date', { ascending: true })

  const receipts = (receiptsRaw ?? []) as Array<{
    id: string; payment_date: string; payment_number: string; amount_received: number
    reference_number: string | null; notes: string | null
    customers: { full_name: string } | null
  }>

  // Cash payments to suppliers
  const { data: paymentsRaw } = await (supabase as any)
    .from('supplier_payments')
    .select('id, payment_date, amount_paid, reference_number, notes, suppliers(supplier_name)')
    .eq('payment_mode', 'cash')
    .gte('payment_date', from)
    .lte('payment_date', to)
    .order('payment_date', { ascending: true })

  const payments = (paymentsRaw ?? []) as Array<{
    id: string; payment_date: string; amount_paid: number
    reference_number: string | null; notes: string | null
    suppliers: { supplier_name: string } | null
  }>

  // Cash expenses
  const { data: expensesRaw } = await (supabase as any)
    .from('expenses')
    .select('id, expense_date, expense_number, category, description, amount, reference_number')
    .eq('payment_method', 'cash')
    .gte('expense_date', from)
    .lte('expense_date', to)
    .order('expense_date', { ascending: true })

  const CATEGORY_LABELS: Record<string, string> = {
    rent: 'Rent', electricity: 'Electricity', water: 'Water', phone: 'Phone / Mobile',
    internet: 'Internet', stationery: 'Stationery & Office', fuel: 'Fuel & Transport',
    vehicle_maintenance: 'Vehicle Maintenance', tools_equipment: 'Tools & Equipment',
    marketing: 'Marketing', bank_charges: 'Bank Charges', insurance: 'Insurance',
    professional_services: 'Professional Services', food_entertainment: 'Food & Refreshments',
    other: 'Miscellaneous',
  }

  const expenses = (expensesRaw ?? []) as Array<{
    id: string; expense_date: string; expense_number: string; category: string
    description: string; amount: number; reference_number: string | null
  }>

  // Cash salary payments
  const { data: salaryRaw } = await (supabase as any)
    .from('salary_slips')
    .select('id, payment_date, net_salary, staff(full_name), salary_runs(salary_month, salary_year)')
    .eq('payment_status', 'paid')
    .eq('payment_mode', 'cash')
    .gte('payment_date', from)
    .lte('payment_date', to)
    .order('payment_date', { ascending: true })

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const salaries = (salaryRaw ?? []) as Array<{
    id: string; payment_date: string; net_salary: number
    staff: { full_name: string } | null
    salary_runs: { salary_month: number; salary_year: number } | null
  }>

  // Merge into a single ledger sorted by date
  type Entry = { date: string; narration: string; receipts: number; payments: number; ref: string }
  const entries: Entry[] = [
    ...receipts.map((r) => ({
      date: r.payment_date,
      narration: `Receipt from ${r.customers?.full_name ?? 'Customer'} (${r.payment_number})`,
      receipts: r.amount_received,
      payments: 0,
      ref: r.reference_number ?? '—',
    })),
    ...payments.map((p) => ({
      date: p.payment_date,
      narration: `Payment to ${p.suppliers?.supplier_name ?? 'Supplier'}`,
      receipts: 0,
      payments: p.amount_paid,
      ref: p.reference_number ?? '—',
    })),
    ...salaries.map((s) => {
      const run = s.salary_runs
      const period = run ? `${MONTHS[run.salary_month - 1]} ${run.salary_year}` : ''
      return {
        date: s.payment_date,
        narration: `Salary — ${s.staff?.full_name ?? 'Staff'}${period ? ` (${period})` : ''}`,
        receipts: 0,
        payments: s.net_salary,
        ref: '—',
      }
    }),
    ...expenses.map((e) => ({
      date: e.expense_date,
      narration: `Expense — ${CATEGORY_LABELS[e.category] ?? e.category}: ${e.description}`,
      receipts: 0,
      payments: e.amount,
      ref: e.reference_number ?? e.expense_number,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const totalReceipts = entries.reduce((s, e) => s + e.receipts, 0)
  const totalPayments = entries.reduce((s, e) => s + e.payments, 0)
  const closingBalance = openingCash + totalReceipts - totalPayments

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Cash Book" subtitle={`${formatDate(from)} to ${formatDate(to)}`} />
      </div>
      <Header title="Cash Book" subtitle="All cash receipts and payments"
        actions={<PrintActions />} />

      <div className="p-6 space-y-5">
        {/* Date filter */}
        <form method="get" className="flex items-center gap-3 flex-wrap print:hidden">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <label className="font-medium">From</label>
            <input type="date" name="from" defaultValue={from}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <label className="font-medium">To</label>
            <input type="date" name="to" defaultValue={to}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Apply
          </button>
        </form>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Receipts</p>
            </div>
            <p className="text-xl font-bold text-green-600">{formatCurrency(totalReceipts)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Payments</p>
            </div>
            <p className="text-xl font-bold text-red-500">{formatCurrency(totalPayments)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="w-4 h-4 text-blue-600" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Closing Balance</p>
            </div>
            <p className={`text-xl font-bold ${closingBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {formatCurrency(closingBalance)}
            </p>
          </div>
        </div>

        {/* Ledger table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Cash Transactions</h3>
            <span className="text-xs text-slate-500">{entries.length} entries · {formatDate(from)} to {formatDate(to)}</span>
          </div>
          {entries.length === 0 ? (
            <div className="p-10 text-center">
              <Banknote className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No cash transactions in this period</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Date</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Narration</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Ref</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 text-green-700">Receipts (Dr)</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 text-red-600">Payments (Cr)</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(() => {
                    let running = openingCash
                    return [
                      // Opening balance row
                      ...(openingCash > 0 ? [(
                        <tr key="opening" className="bg-blue-50">
                          <td className="px-5 py-3 text-sm text-slate-500 whitespace-nowrap">{openingDate ? formatDate(openingDate) : '—'}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-blue-700">Opening Balance b/f</td>
                          <td className="px-4 py-3 text-xs text-slate-400 font-mono">—</td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-blue-700">{formatCurrency(openingCash)}</td>
                          <td className="px-4 py-3 text-right text-sm text-slate-400">—</td>
                          <td className="px-5 py-3 text-right text-sm font-bold text-blue-700">{formatCurrency(openingCash)}</td>
                        </tr>
                      )] : []),
                      ...entries.map((e, i) => {
                        running += e.receipts - e.payments
                        return (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(e.date)}</td>
                            <td className="px-4 py-3 text-sm text-slate-800">{e.narration}</td>
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
                    <td colSpan={3} className="px-5 py-3 text-sm font-bold text-slate-700">Total</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-700">{formatCurrency(totalReceipts)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(totalPayments)}</td>
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
