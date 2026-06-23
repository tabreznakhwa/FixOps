'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatStatus } from '@/lib/utils'

const COLORS = [
  '#8b5cf6', '#f59e0b', '#3b82f6', '#6366f1', '#06b6d4',
  '#14b8a6', '#f97316', '#84cc16', '#10b981', '#22c55e',
]

export function ComplaintStatusChart({ statusCounts }: { statusCounts: Record<string, number> }) {
  const data = Object.entries(statusCounts)
    .filter(([, v]) => v > 0)
    .map(([status, count]) => ({ name: formatStatus(status), value: count, key: status }))
    .sort((a, b) => b.value - a.value)

  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="mb-4">
        <h3 className="font-semibold text-slate-900">Complaint Breakdown</h3>
        <p className="text-sm text-slate-500 mt-0.5">{total} active complaints</p>
      </div>

      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
          No complaints yet
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {data.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 8, color: '#f8fafc', fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="space-y-1.5 mt-2">
            {data.slice(0, 5).map(({ name, value }, idx) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[idx % COLORS.length] }} />
                  <span className="text-xs text-slate-600 truncate max-w-28">{name}</span>
                </div>
                <span className="text-xs font-semibold text-slate-900">{value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
