import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { Plus, Receipt, TrendingDown, Banknote, Landmark } from 'lucide-react'

export const metadata = { title: 'Expenses' }

const CATEGORY_LABELS: Record<string, string> = {
  rent: 'Rent',
  electricity: 'Electricity',
  water: 'Water',
  phone: 'Phone / Mobile',
  internet: 'Internet',
  stationery: 'Stationery & Office',
  fuel: 'Fuel & Transport',
  vehicle_maintenance: 'Vehicle Maintenance',
  tools_equipment: 'Tools & Equipment',
  marketing: 'Marketing & Advertising',
  bank_charges: 'Bank Charges',
  insurance: 'Insurance',
  professional_services: 'Professional Services',
  food_entertainment: 'Food & Refreshments',
  other: 'Miscellaneous / Other',
}

const CATEGORY_COLORS: Record<string, string> = {
  rent: 'bg-purple-100 text-purple-700',
  electricity: 'bg-yellow-100 text-yellow-700',
  water: 'bg-cyan-100 text-cyan-700',
  phone: 'bg-blue-100 text-blue-700',
  internet: 'bg-indigo-100 text-indigo-700',
  stationery: 'bg-slate-100 text-slate-700',
  fuel: 'bg-orange-100 text-orange-700',
  vehicle_maintenance: 'bg-amber-100 text-amber-700',
  tools_equipment: 'bg-teal-100 text-teal-700',
  marketing: 'bg-pink-100 text-pink-700',
  bank_charges: 'bg-red-100 text-red-700',
  insurance: 'bg-green-100 text-green-700',
  professional_services: 'bg-violet-100 text-violet-700',
  food_entertainment: 'bg-rose-100 text-rose-700',
  other: 'bg-gray-100 text-gray-700',
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; category?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 7) + '-01'
  const from = params.from ?? firstOfMonth
  const to = params.to ?? today

  let query = (supabase as any)
    .from('expenses')
    .select('id, expense_number, expense_date, category, description, amount, payment_method, reference_number, notes')
    .gte('expense_date', from)
    .lte('expense_date', to)
    .order('expense_date', { ascending: false })

  if (params.category) query = query.eq('category', params.category)

  const { data: rawExpenses } = await query

  const expenses = (rawExpenses ?? []) as Array<{
    id: string; expense_number: string; expense_date: string; category: string
    description: string; amount: number; payment_method: string
    reference_number: string | null; notes: string | null
  }>

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0)
  const cashTotal = expenses.filter(e => e.payment_method === 'cash').reduce((s, e) => s + e.amount, 0)
  const bankTotal = expenses.filter(e => e.payment_method !== 'cash').reduce((s, e) => s + e.amount, 0)

  return (
    <div className="animate-fade-in">
      <Header
        title="Expenses"
        subtitle="Daily operational expenses"
        actions={
          <Link
            href="/finance/expenses/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Expense
          </Link>
        }
      />

      <div className="p-6 space-y-5">
        {/* Filters */}
        <form method="get" className="flex items-center gap-3 flex-wrap">
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
          <select name="category" defaultValue={params.category ?? ''}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Apply
          </button>
          {(params.from || params.to || params.category) && (
            <Link href="/finance/expenses" className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">
              Clear
            </Link>
          )}
        </form>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Expenses</p>
            </div>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totalAmount)}</p>
            <p className="text-xs text-slate-400 mt-1">{expenses.length} entries</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="w-4 h-4 text-slate-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cash</p>
            </div>
            <p className="text-xl font-bold text-slate-700">{formatCurrency(cashTotal)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Landmark className="w-4 h-4 text-slate-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bank / Cheque</p>
            </div>
            <p className="text-xl font-bold text-slate-700">{formatCurrency(bankTotal)}</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Expense Entries</h3>
            <span className="text-xs text-slate-500">{expenses.length} entries · {formatDate(from)} to {formatDate(to)}</span>
          </div>

          {expenses.length === 0 ? (
            <div className="p-12 text-center">
              <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No expenses recorded</p>
              <p className="text-slate-400 text-sm mt-1">Add your first expense for this period</p>
              <Link
                href="/finance/expenses/new"
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Expense
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Date</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Ref #</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Category</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Description</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Payment</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 text-sm text-slate-600 whitespace-nowrap">{formatDate(e.expense_date)}</td>
                      <td className="px-4 py-3.5 text-xs text-slate-400 font-mono">{e.expense_number}</td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_COLORS[e.category] ?? 'bg-slate-100 text-slate-700'}`}>
                          {CATEGORY_LABELS[e.category] ?? e.category}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-800">
                        {e.description}
                        {e.reference_number && (
                          <span className="ml-2 text-xs text-slate-400 font-mono">({e.reference_number})</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          e.payment_method === 'cash'
                            ? 'bg-green-100 text-green-700'
                            : e.payment_method === 'cheque'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {e.payment_method === 'cash' ? 'Cash' : e.payment_method === 'cheque' ? 'Cheque' : 'Bank Transfer'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm font-semibold text-red-600">
                        {formatCurrency(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={5} className="px-5 py-3 text-sm font-bold text-slate-700">Total</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(totalAmount)}</td>
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
