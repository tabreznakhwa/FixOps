import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'
import { formatCurrency } from '@/lib/utils'
import { AlertTriangle, TrendingUp, TrendingDown, Package, Wallet } from 'lucide-react'
import { buildBusinessMetrics } from './businessMetrics'
import { InsightsClient } from './InsightsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Business Insights' }

export default async function InsightsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient() as any
  const { data: profileRaw } = await admin
    .from('users').select('organization_id, role').eq('id', user.id).single()
  const profile = profileRaw as { organization_id: string; role: string } | null

  // Exposes margins, payroll and profitability — owner/admin only.
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    redirect('/dashboard?error=unauthorized')
  }
  const orgId = profile.organization_id

  const [metrics, latestRaw, overdueRaw] = await Promise.all([
    buildBusinessMetrics(admin, orgId, { months: 6 }),
    admin.from('ai_insights')
      .select('analysis, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Named list stays on the server and in the browser — never sent to the AI.
    admin.from('invoices')
      .select('invoice_number, invoice_date, due_date, balance_due, customers(full_name)')
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
      .gt('balance_due', 0)
      .order('due_date', { ascending: true })
      .limit(10),
  ])

  const latest = latestRaw?.data as { analysis: string; created_at: string } | null
  const overdue = (overdueRaw?.data ?? []) as Array<{
    invoice_number: string; invoice_date: string; due_date: string | null
    balance_due: number; customers: { full_name: string } | null
  }>

  const recent = metrics.months.slice(-3)
  const prior = metrics.months.slice(-6, -3)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const recentRev = avg(recent.map(m => m.revenue))
  const priorRev = avg(prior.map(m => m.revenue))
  const revTrendPct = priorRev > 0 ? ((recentRev - priorRev) / priorRev) * 100 : null

  const hasEnoughData = metrics.totals.revenue > 0 || metrics.stock.totalValue > 0

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })
  const daysOverdue = (ref: string | null) => {
    if (!ref) return null
    const d = Math.floor((new Date(today).getTime() - new Date(ref).getTime()) / 86_400_000)
    return d > 0 ? d : null
  }

  const cards = [
    { label: 'Revenue (6 mo)', value: metrics.totals.revenue, icon: TrendingUp, tone: 'text-slate-900' },
    {
      label: 'Net Profit (6 mo)', value: metrics.totals.netProfit,
      icon: metrics.totals.netProfit >= 0 ? TrendingUp : TrendingDown,
      tone: metrics.totals.netProfit >= 0 ? 'text-green-700' : 'text-red-600',
    },
    { label: 'Outstanding', value: metrics.receivables.total, icon: Wallet, tone: 'text-amber-700' },
    { label: 'Stock Value', value: metrics.stock.totalValue, icon: Package, tone: 'text-slate-900' },
  ]

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Business Insights" subtitle={`${metrics.periodFrom} to ${metrics.periodTo}`} />
      </div>

      <Header
        title="Business Insights"
        subtitle="Performance review and recommendations"
        actions={
          <div className="flex items-center gap-2">
            <PrintActions label="Print" />
            <BackButton fallbackHref="/dashboard" label="Dashboard" />
          </div>
        }
      />

      <div className="p-6 space-y-5 max-w-5xl">
        {metrics.failedSources.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-700">
              <p className="font-semibold">Some data could not be loaded</p>
              <p className="text-xs mt-0.5">
                Figures below exclude: {metrics.failedSources.join(', ')}. Treat the
                totals and any analysis as incomplete until this is resolved.
              </p>
            </div>
          </div>
        )}

        {/* Headline numbers */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-slate-500 uppercase tracking-wider">{c.label}</p>
                <c.icon className="w-4 h-4 text-slate-300" />
              </div>
              <p className={`text-lg font-bold ${c.tone}`}>{formatCurrency(c.value)}</p>
              {c.label === 'Revenue (6 mo)' && revTrendPct !== null && (
                <p className={`text-xs mt-0.5 ${revTrendPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {revTrendPct >= 0 ? '▲' : '▼'} {Math.abs(revTrendPct).toFixed(1)}% vs prior 3 months
                </p>
              )}
            </div>
          ))}
        </div>

        {/* The advisor */}
        <InsightsClient
          initialAnalysis={latest?.analysis ?? null}
          initialGeneratedAt={latest?.created_at ?? null}
          hasEnoughData={hasEnoughData}
        />

        {/* Monthly trend */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Monthly Trend</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Net profit = revenue − parts cost − expenses − payroll
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Month', 'Revenue', 'Collected', 'Parts Cost', 'Expenses', 'Payroll', 'Net Profit'].map((h, i) => (
                    <th key={h} className={`text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 ${i === 0 ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {metrics.months.map(m => (
                  <tr key={m.key} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{m.label}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">{formatCurrency(m.revenue)}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">{formatCurrency(m.collected)}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">{formatCurrency(m.cogs)}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">{formatCurrency(m.expenses)}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">{formatCurrency(m.payroll)}</td>
                    <td className={`px-4 py-3 text-right text-sm font-bold ${m.netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {formatCurrency(m.netProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Named lists — local only, deliberately not sent to the AI */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Chase These Payments</h3>
              <p className="text-xs text-slate-500 mt-0.5">Oldest unpaid first</p>
            </div>
            {overdue.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">Nothing outstanding.</p>
            ) : (
              <table className="w-full">
                <tbody className="divide-y divide-slate-50">
                  {overdue.map(inv => {
                    const d = daysOverdue(inv.due_date ?? inv.invoice_date)
                    return (
                      <tr key={inv.invoice_number} className="hover:bg-slate-50/50">
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium text-slate-800">
                            {inv.customers?.full_name ?? '—'}
                          </p>
                          <p className="text-xs text-slate-400 font-mono">{inv.invoice_number}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-sm font-semibold text-slate-900">{formatCurrency(inv.balance_due)}</p>
                          {d && <p className="text-xs text-red-600">{d} days overdue</p>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Money Tied Up in Stock</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                No movement in 90+ days · {formatCurrency(metrics.stock.deadStockValue)} total
              </p>
            </div>
            {metrics.stock.deadStock.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">All stock is moving. Good.</p>
            ) : (
              <table className="w-full">
                <tbody className="divide-y divide-slate-50">
                  {metrics.stock.deadStock.slice(0, 10).map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium text-slate-800 line-clamp-1">{item.itemName}</p>
                        <p className="text-xs text-slate-400">
                          {item.lastIssuedAt ? `Last used ${item.lastIssuedAt}` : 'Never used'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-semibold text-slate-900">{formatCurrency(item.value)}</p>
                        <p className="text-xs text-slate-400">{item.currentStock} on hand</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {metrics.stock.belowMinimum.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Reorder Soon</h3>
              <p className="text-xs text-slate-500 mt-0.5">Below minimum stock level</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <tbody className="divide-y divide-slate-50">
                  {metrics.stock.belowMinimum.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 text-sm font-medium text-slate-800">{item.itemName}</td>
                      <td className="px-4 py-3 text-right text-sm text-red-600 font-semibold">
                        {item.currentStock} on hand
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-500">
                        min {item.minimumLevel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-slate-400 print:hidden">
          Analysis is generated from aggregated totals only — customer, supplier and
          staff names are never sent to the AI provider.
        </p>
      </div>
    </div>
  )
}
