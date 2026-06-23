'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface RevenueChartProps {
  data: { invoice_date: string; total_amount: number; amount_paid: number }[]
}

export function RevenueChart({ data }: RevenueChartProps) {
  // Group by date
  const grouped: Record<string, { invoiced: number; collected: number }> = {}
  data.forEach((d) => {
    const date = new Date(d.invoice_date).toLocaleDateString('en-AE', { day: '2-digit', month: 'short' })
    if (!grouped[date]) grouped[date] = { invoiced: 0, collected: 0 }
    grouped[date].invoiced += d.total_amount ?? 0
    grouped[date].collected += d.amount_paid ?? 0
  })

  const chartData = Object.entries(grouped).map(([date, v]) => ({ date, ...v }))

  const total = data.reduce((s, d) => s + (d.total_amount ?? 0), 0)
  const collected = data.reduce((s, d) => s + (d.amount_paid ?? 0), 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="font-semibold text-slate-900">Revenue This Month</h3>
          <p className="text-sm text-slate-500 mt-0.5">Invoiced vs Collected</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(total)}</p>
          <p className="text-xs text-green-600 font-medium mt-0.5">
            {formatCurrency(collected)} collected
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-xs text-slate-500">Invoiced</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="text-xs text-slate-500">Collected</span>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
          No revenue data this month
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="invoiced" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="collected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 8, color: '#f8fafc', fontSize: 12 }}
              formatter={(value: unknown, name: unknown) => [formatCurrency(Number(value)), name === 'invoiced' ? 'Invoiced' : 'Collected'] as [string, string]}
            />
            <Area type="monotone" dataKey="invoiced" stroke="#3b82f6" strokeWidth={2} fill="url(#invoiced)" />
            <Area type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2} fill="url(#collected)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
