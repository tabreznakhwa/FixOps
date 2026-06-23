import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils'
import { TrendingUp, FileText, DollarSign, Users } from 'lucide-react'
import { ReportExportButton } from './ReportExportButton'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'

export const metadata = { title: 'Finance Reports' }

type Range = 'month' | 'last_month' | 'quarter' | 'year' | 'all'

function getDateRange(range: Range): { from: string | null; to: string | null } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  if (range === 'month') {
    return {
      from: new Date(y, m, 1).toISOString(),
      to: new Date(y, m + 1, 0, 23, 59, 59).toISOString(),
    }
  }
  if (range === 'last_month') {
    return {
      from: new Date(y, m - 1, 1).toISOString(),
      to: new Date(y, m, 0, 23, 59, 59).toISOString(),
    }
  }
  if (range === 'quarter') {
    const qStart = Math.floor(m / 3) * 3
    return {
      from: new Date(y, qStart, 1).toISOString(),
      to: new Date(y, qStart + 3, 0, 23, 59, 59).toISOString(),
    }
  }
  if (range === 'year') {
    return {
      from: new Date(y, 0, 1).toISOString(),
      to: new Date(y, 11, 31, 23, 59, 59).toISOString(),
    }
  }
  return { from: null, to: null }
}

function getRangeLabel(range: Range): string {
  const labels: Record<Range, string> = {
    month: 'This Month',
    last_month: 'Last Month',
    quarter: 'This Quarter',
    year: 'This Year',
    all: 'All Time',
  }
  return labels[range]
}

interface MonthlyData {
  month: string
  invoiced: number
  collected: number
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const params = await searchParams
  const rawRange = params.range as Range | undefined
  const range: Range = ['month', 'last_month', 'quarter', 'year', 'all'].includes(rawRange ?? '')
    ? (rawRange as Range)
    : 'month'

  const supabase = await createClient()
  const { from, to } = getDateRange(range)

  // Build invoice query for the selected range
  let invQuery = supabase
    .from('invoices')
    .select(
      'id, total_amount, amount_paid, balance_due, status, invoice_date, customer_id, customers(full_name)',
    )
    .not('status', 'in', '(cancelled,written_off)')

  if (from) invQuery = invQuery.gte('invoice_date', from.split('T')[0])
  if (to) invQuery = invQuery.lte('invoice_date', to.split('T')[0])

  const { data: invoicesRaw } = await (invQuery as any)

  const invoices = (invoicesRaw ?? []) as unknown as Array<{
    id: string
    total_amount: number
    amount_paid: number
    balance_due: number
    status: string
    invoice_date: string
    customer_id: string
    customers: { full_name: string } | null
  }>

  // KPIs
  const totalInvoiced = invoices.reduce((s, i) => s + i.total_amount, 0)
  const totalCollected = invoices.reduce((s, i) => s + i.amount_paid, 0)
  const totalOutstanding = invoices.reduce((s, i) => s + i.balance_due, 0)
  const collectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0

  // Monthly revenue — last 6 months always (ignores range filter for the bar chart)
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
  sixMonthsAgo.setDate(1)

  const { data: allInvoicesRaw } = await (supabase as any)
    .from('invoices')
    .select('invoice_date, total_amount, amount_paid, status')
    .not('status', 'in', '(cancelled,written_off)')
    .gte('invoice_date', sixMonthsAgo.toISOString().split('T')[0])
    .order('invoice_date', { ascending: true })

  const allInvoices = (allInvoicesRaw ?? []) as unknown as Array<{
    invoice_date: string
    total_amount: number
    amount_paid: number
    status: string
  }>

  // Aggregate by month
  const monthlyMap: Record<string, MonthlyData> = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-AE', { month: 'short', year: '2-digit' })
    monthlyMap[key] = { month: label, invoiced: 0, collected: 0 }
  }
  for (const inv of allInvoices) {
    const key = inv.invoice_date.slice(0, 7)
    if (monthlyMap[key]) {
      monthlyMap[key].invoiced += inv.total_amount
      monthlyMap[key].collected += inv.amount_paid
    }
  }
  const monthlyData = Object.values(monthlyMap)
  const maxMonthly = Math.max(...monthlyData.map((m) => m.invoiced), 1)

  // Payment mode breakdown
  let pmQuery = supabase
    .from('payments')
    .select('payment_mode, amount_received')
    .eq('is_cancelled', false)
  if (from) pmQuery = pmQuery.gte('payment_date', from.split('T')[0])
  if (to) pmQuery = pmQuery.lte('payment_date', to.split('T')[0])
  const { data: paymentsRaw } = await pmQuery
  const payments = (paymentsRaw ?? []) as unknown as Array<{
    payment_mode: string
    amount_received: number
  }>

  const modeBreakdown: Record<string, number> = {}
  let totalPayments = 0
  for (const p of payments) {
    modeBreakdown[p.payment_mode] = (modeBreakdown[p.payment_mode] ?? 0) + p.amount_received
    totalPayments += p.amount_received
  }
  const modeEntries = Object.entries(modeBreakdown).sort(([, a], [, b]) => b - a)

  // Receivables aging (based on all non-paid open invoices — ignores range filter)
  const { data: agingRaw } = await (supabase as any)
    .from('invoices')
    .select('balance_due, due_date, status')
    .in('status', ['issued', 'partial', 'overdue'])
    .gt('balance_due', 0)

  const aging = (agingRaw ?? []) as unknown as Array<{
    balance_due: number
    due_date: string | null
    status: string
  }>

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let agingCurrent = 0
  let aging1to30 = 0
  let aging31to60 = 0
  let aging60plus = 0

  for (const inv of aging) {
    if (!inv.due_date) {
      agingCurrent += inv.balance_due
      continue
    }
    const due = new Date(inv.due_date)
    due.setHours(0, 0, 0, 0)
    const daysPast = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
    if (daysPast <= 0) agingCurrent += inv.balance_due
    else if (daysPast <= 30) aging1to30 += inv.balance_due
    else if (daysPast <= 60) aging31to60 += inv.balance_due
    else aging60plus += inv.balance_due
  }
  const totalAging = agingCurrent + aging1to30 + aging31to60 + aging60plus

  // Top 10 customers by revenue
  const customerMap: Record<string, { name: string; invoiced: number; paid: number; balance: number }> = {}
  for (const inv of invoices) {
    const name = inv.customers?.full_name ?? 'Unknown'
    const cid = inv.customer_id
    if (!customerMap[cid]) {
      customerMap[cid] = { name, invoiced: 0, paid: 0, balance: 0 }
    }
    customerMap[cid].invoiced += inv.total_amount
    customerMap[cid].paid += inv.amount_paid
    customerMap[cid].balance += inv.balance_due
  }
  const topCustomers = Object.values(customerMap)
    .sort((a, b) => b.invoiced - a.invoiced)
    .slice(0, 10)

  const RANGE_TABS: Range[] = ['month', 'last_month', 'quarter', 'year', 'all']

  const MODE_LABELS: Record<string, string> = {
    cash: 'Cash',
    bank_transfer: 'Bank Transfer',
    card: 'Card',
    pos: 'POS',
    cheque: 'Cheque',
    online: 'Online',
    other: 'Other',
  }

  const fromLabel = from ? formatDate(from.split('T')[0]) : 'All time'
  const toLabel = to ? formatDate(to.split('T')[0]) : ''
  const periodLabel = toLabel ? `${fromLabel} to ${toLabel}` : fromLabel

  return (
    <div className="animate-fade-in">
      {/* Print header — hidden on screen */}
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Finance Report" subtitle={`${getRangeLabel(range)} · ${periodLabel}`} />
      </div>

      <Header
        title="Finance Reports"
        subtitle="Revenue, collections and receivables analytics"
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButton range={range} />
            <PrintActions label="Print PDF" />
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* Date range tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 print:hidden">
          {RANGE_TABS.map((r) => (
            <Link
              key={r}
              href={`/reports?range=${r}`}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                range === r
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {getRangeLabel(r)}
            </Link>
          ))}
        </div>

        {/* Revenue KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalInvoiced)}</p>
            <p className="text-sm font-medium text-slate-600 mt-0.5">Total Invoiced</p>
            <p className="text-xs text-slate-400 mt-0.5">{getRangeLabel(range)}</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(totalCollected)}</p>
            <p className="text-sm font-medium text-slate-600 mt-0.5">Total Collected</p>
            <p className="text-xs text-slate-400 mt-0.5">{getRangeLabel(range)}</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalOutstanding)}</p>
            <p className="text-sm font-medium text-slate-600 mt-0.5">Outstanding</p>
            <p className="text-xs text-slate-400 mt-0.5">Unpaid balance</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-purple-700">{collectionRate.toFixed(1)}%</p>
            <p className="text-sm font-medium text-slate-600 mt-0.5">Collection Rate</p>
            <p className="text-xs text-slate-400 mt-0.5">Collected / Invoiced</p>
          </div>
        </div>

        {/* Monthly Revenue Bar Chart (last 6 months) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-1">Monthly Revenue</h3>
          <p className="text-xs text-slate-400 mb-5">Last 6 months — Invoiced vs Collected</p>

          <div className="flex items-end gap-3 h-48">
            {monthlyData.map((m) => {
              const invoicedPct = Math.max(2, (m.invoiced / maxMonthly) * 100)
              const collectedPct = Math.max(m.collected > 0 ? 2 : 0, (m.collected / maxMonthly) * 100)
              return (
                <div
                  key={m.month}
                  className="flex-1 flex flex-col items-center gap-1.5 min-w-0"
                >
                  <div className="w-full flex items-end gap-1 h-36">
                    <div
                      className="flex-1 bg-blue-200 rounded-t-sm transition-all relative group"
                      style={{ height: `${invoicedPct}%` }}
                    >
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {formatCurrency(m.invoiced)}
                      </div>
                    </div>
                    <div
                      className="flex-1 bg-green-400 rounded-t-sm transition-all relative group"
                      style={{ height: `${collectedPct}%` }}
                    >
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {formatCurrency(m.collected)}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">{m.month}</span>
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-5 mt-4 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-200 rounded-sm" />
              <span className="text-xs text-slate-600">Invoiced</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-400 rounded-sm" />
              <span className="text-xs text-slate-600">Collected</span>
            </div>
          </div>
        </div>

        {/* Payment Mode Breakdown */}
        {modeEntries.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-1">Payment Mode Breakdown</h3>
            <p className="text-xs text-slate-400 mb-5">
              {getRangeLabel(range)} · Total: {formatCurrency(totalPayments)}
            </p>
            <div className="space-y-3">
              {modeEntries.map(([mode, amount]) => {
                const pct = totalPayments > 0 ? (amount / totalPayments) * 100 : 0
                return (
                  <div key={mode}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-slate-700">
                        {MODE_LABELS[mode] ?? mode}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{pct.toFixed(1)}%</span>
                        <span className="font-semibold text-slate-900 tabular-nums">
                          {formatCurrency(amount)}
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Receivables Aging */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Receivables Aging</h3>
            <p className="text-xs text-slate-400 mt-0.5">All open invoices — current as of today</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">
                  Bucket
                </th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">
                  Amount (AED)
                </th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">
                  % of Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[
                { label: 'Current (not yet due)', amount: agingCurrent, color: 'text-green-700' },
                { label: '1 – 30 days overdue', amount: aging1to30, color: 'text-amber-600' },
                { label: '31 – 60 days overdue', amount: aging31to60, color: 'text-orange-600' },
                { label: '60+ days overdue', amount: aging60plus, color: 'text-red-600' },
              ].map(({ label, amount, color }) => (
                <tr key={label} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5 text-sm text-slate-700">{label}</td>
                  <td className={`px-5 py-3.5 text-sm font-semibold text-right ${color}`}>
                    {formatCurrency(amount)}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-500 text-right">
                    {totalAging > 0 ? ((amount / totalAging) * 100).toFixed(1) : '0.0'}%
                  </td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 bg-slate-50">
                <td className="px-5 py-3.5 text-sm font-bold text-slate-900">Total Outstanding</td>
                <td className="px-5 py-3.5 text-sm font-bold text-slate-900 text-right">
                  {formatCurrency(totalAging)}
                </td>
                <td className="px-5 py-3.5 text-sm font-bold text-slate-900 text-right">100%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Top 10 Customers */}
        {topCustomers.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Top 10 Customers by Revenue</h3>
              <p className="text-xs text-slate-400 mt-0.5">{getRangeLabel(range)}</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">
                    #
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">
                    Customer
                  </th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">
                    Invoiced
                  </th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                    Paid
                  </th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {topCustomers.map((c, i) => (
                  <tr key={c.name + i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          i === 0
                            ? 'bg-yellow-100 text-yellow-700'
                            : i === 1
                            ? 'bg-slate-100 text-slate-600'
                            : i === 2
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-slate-50 text-slate-500'
                        }`}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-3.5 text-sm font-semibold text-slate-900 text-right">
                      {formatCurrency(c.invoiced)}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-green-700 font-semibold text-right hidden md:table-cell">
                      {formatCurrency(c.paid)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span
                        className={`text-sm font-semibold ${
                          c.balance > 0 ? 'text-amber-600' : 'text-green-700'
                        }`}
                      >
                        {formatCurrency(c.balance)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {invoices.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No invoice data for {getRangeLabel(range)}</p>
            <p className="text-slate-400 text-sm mt-1">
              Try selecting a different date range or create your first invoice.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
