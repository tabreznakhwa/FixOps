import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AlertTriangle, TrendingDown, Clock, Users } from 'lucide-react'

export const metadata = { title: 'Receivables' }

export default async function ReceivablesPage() {
  const supabase = await createClient()

  const { data: receivablesRaw } = await supabase
    .from('invoices')
    .select('customer_id, balance_due, due_date, status, invoice_date, customers(full_name, mobile_number, area)')
    .in('status', ['issued', 'partial', 'overdue'])
    .gt('balance_due', 0)
    .order('balance_due', { ascending: false })
  const receivables = receivablesRaw as unknown as Array<{
    customer_id: string; balance_due: number; due_date: string | null; status: string; invoice_date: string;
    customers: { full_name: string; mobile_number: string; area: string | null } | null
  }>

  // Group by customer
  const customerMap: Record<string, {
    customer_id: string
    full_name: string
    mobile_number: string
    area: string | null
    total_balance: number
    invoices: { balance_due: number; due_date: string | null; status: string; invoice_date: string }[]
  }> = {}

  receivables?.forEach((inv) => {
    const customer = inv.customers as { full_name: string; mobile_number: string; area: string | null } | null
    if (!customer) return
    if (!customerMap[inv.customer_id]) {
      customerMap[inv.customer_id] = {
        customer_id: inv.customer_id,
        full_name: customer.full_name,
        mobile_number: customer.mobile_number,
        area: customer.area,
        total_balance: 0,
        invoices: [],
      }
    }
    customerMap[inv.customer_id].total_balance += inv.balance_due
    customerMap[inv.customer_id].invoices.push({
      balance_due: inv.balance_due,
      due_date: inv.due_date,
      status: inv.status,
      invoice_date: inv.invoice_date,
    })
  })

  const customers = Object.values(customerMap).sort((a, b) => b.total_balance - a.total_balance)

  // Aging buckets
  const now = new Date()
  const aging = { current: 0, '30': 0, '60': 0, '90+': 0 }
  receivables?.forEach((inv) => {
    if (!inv.due_date) { aging.current += inv.balance_due; return }
    const daysPast = Math.floor((now.getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24))
    if (daysPast <= 0) aging.current += inv.balance_due
    else if (daysPast <= 30) aging['30'] += inv.balance_due
    else if (daysPast <= 60) aging['60'] += inv.balance_due
    else aging['90+'] += inv.balance_due
  })

  const totalReceivables = customers.reduce((s, c) => s + c.total_balance, 0)

  return (
    <div className="animate-fade-in">
      <Header title="Receivables" subtitle="Outstanding customer balances" />

      <div className="p-6 space-y-6">
        {/* Total + Aging */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-5 text-white">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-80">Total Outstanding</span>
            </div>
            <p className="text-3xl font-bold">{formatCurrency(totalReceivables)}</p>
            <p className="text-sm opacity-70 mt-1">{customers.length} customers with balances</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" /> Aging Analysis
            </p>
            <div className="space-y-2">
              {[
                { label: 'Current (not due)', value: aging.current, color: 'bg-green-500' },
                { label: '1–30 days overdue', value: aging['30'], color: 'bg-yellow-500' },
                { label: '31–60 days overdue', value: aging['60'], color: 'bg-orange-500' },
                { label: '60+ days overdue', value: aging['90+'], color: 'bg-red-500' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${color} flex-shrink-0`} />
                  <span className="text-xs text-slate-600 flex-1">{label}</span>
                  <span className="text-xs font-bold text-slate-900">{formatCurrency(value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Customer Receivables Table */}
        {customers.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No outstanding receivables</p>
            <p className="text-slate-400 text-sm">All invoices are paid up!</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Customer Balances</h3>
              <span className="text-sm text-slate-500">{customers.length} customers</span>
            </div>
            <div className="divide-y divide-slate-50">
              {customers.map((c, idx) => {
                const overdueCount = c.invoices.filter((i) => i.status === 'overdue').length
                const maxBalance = customers[0].total_balance
                const barWidth = (c.total_balance / maxBalance) * 100

                return (
                  <div key={c.customer_id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-400 w-5">#{idx + 1}</span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{c.full_name}</p>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <span>📱 {c.mobile_number}</span>
                            {c.area && <span>📍 {c.area}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-amber-600">{formatCurrency(c.total_balance)}</p>
                        <div className="flex items-center gap-2 justify-end mt-0.5">
                          <span className="text-xs text-slate-500">{c.invoices.length} inv.</span>
                          {overdueCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                              <AlertTriangle className="w-3 h-3" /> {overdueCount} overdue
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Balance bar */}
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
