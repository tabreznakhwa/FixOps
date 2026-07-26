'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { CheckCircle, Clock, Zap, FileText, TrendingUp, DollarSign, Trophy, ChevronUp, ChevronDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export type TechPerf = {
  userId: string
  name: string
  totalComplaints: number
  completedComplaints: number
  activeComplaints: number
  emergencyCompleted: number
  workOrders: number
  revenueBilled: number
  revenueCollected: number
}

const PERIODS = [
  { key: 'month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
]

type SortKey = keyof Omit<TechPerf, 'userId' | 'name'>
type SortDir = 'asc' | 'desc'

const PODIUM_STYLES = [
  { bg: 'bg-amber-50 border-amber-300', badge: 'bg-amber-400 text-white', label: '🥇 1st', ring: 'ring-2 ring-amber-300' },
  { bg: 'bg-slate-50 border-slate-300', badge: 'bg-slate-400 text-white', label: '🥈 2nd', ring: 'ring-2 ring-slate-300' },
  { bg: 'bg-orange-50 border-orange-200', badge: 'bg-orange-400 text-white', label: '🥉 3rd', ring: 'ring-2 ring-orange-200' },
]

function completionRate(t: TechPerf) {
  return t.totalComplaints > 0 ? Math.round((t.completedComplaints / t.totalComplaints) * 100) : 0
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export function PerformanceClient({
  technicians,
  period,
}: {
  technicians: TechPerf[]
  period: string
}) {
  const router = useRouter()
  const [sortKey, setSortKey] = useState<SortKey>('completedComplaints')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function setPeriod(p: string) {
    router.push(`/staff/performance?period=${p}`)
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...technicians].sort((a, b) => {
    const av = sortKey === 'completedComplaints' ? completionRate(a) === completionRate(b) ? a[sortKey] : a[sortKey]
      : a[sortKey]
    const bv = b[sortKey]
    return sortDir === 'desc' ? (bv as number) - (av as number) : (av as number) - (bv as number)
  })

  const podium = technicians.slice(0, 3) // always by completedComplaints (server sort)
  const totalCompleted = technicians.reduce((s, t) => s + t.completedComplaints, 0)
  const totalBilled = technicians.reduce((s, t) => s + t.revenueBilled, 0)
  const totalCollected = technicians.reduce((s, t) => s + t.revenueCollected, 0)

  const cols: { key: SortKey; label: string; icon: React.ReactNode; format: (t: TechPerf) => string | number }[] = [
    { key: 'completedComplaints', label: 'Completed', icon: <CheckCircle className="w-3.5 h-3.5" />, format: t => t.completedComplaints },
    { key: 'activeComplaints', label: 'Active', icon: <Clock className="w-3.5 h-3.5" />, format: t => t.activeComplaints },
    { key: 'totalComplaints', label: 'Completion %', icon: <TrendingUp className="w-3.5 h-3.5" />, format: t => `${completionRate(t)}%` },
    { key: 'workOrders', label: 'Work Orders', icon: <FileText className="w-3.5 h-3.5" />, format: t => t.workOrders },
    { key: 'emergencyCompleted', label: 'Emergency ✓', icon: <Zap className="w-3.5 h-3.5" />, format: t => t.emergencyCompleted },
    { key: 'revenueBilled', label: 'Billed', icon: <TrendingUp className="w-3.5 h-3.5" />, format: t => formatCurrency(t.revenueBilled) },
    { key: 'revenueCollected', label: 'Collected', icon: <DollarSign className="w-3.5 h-3.5" />, format: t => formatCurrency(t.revenueCollected) },
  ]

  return (
    <div className="space-y-6">
      {/* Period Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {PERIODS.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              period === p.key ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-100 rounded-xl px-5 py-4">
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">Jobs Completed</p>
          <p className="text-3xl font-bold text-green-700">{totalCompleted}</p>
          <p className="text-xs text-green-600 mt-0.5">across all technicians</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Revenue Billed</p>
          <p className="text-3xl font-bold text-blue-700">{formatCurrency(totalBilled)}</p>
          <p className="text-xs text-blue-600 mt-0.5">from work orders</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-5 py-4">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Collected</p>
          <p className="text-3xl font-bold text-emerald-700">{formatCurrency(totalCollected)}</p>
          <p className="text-xs text-emerald-600 mt-0.5">{totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0}% of billed</p>
        </div>
      </div>

      {/* Podium — top 3 by completed complaints */}
      {podium.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Top Performers</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {podium.map((t, i) => {
              const style = PODIUM_STYLES[i]
              const rate = completionRate(t)
              return (
                <div
                  key={t.userId}
                  className={`relative border rounded-xl p-5 ${style.bg} ${style.ring}`}
                >
                  <span className={`absolute top-3 right-3 text-xs font-bold px-2 py-0.5 rounded-full ${style.badge}`}>
                    {style.label}
                  </span>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-700 flex-shrink-0">
                      {initials(t.name)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm leading-tight">{t.name}</p>
                      <p className="text-xs text-slate-500">{rate}% completion rate</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-600">Completed</span>
                      <span className="text-sm font-bold text-green-700">{t.completedComplaints}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-600">Work Orders</span>
                      <span className="text-sm font-semibold text-slate-700">{t.workOrders}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-600">Revenue Billed</span>
                      <span className="text-sm font-semibold text-blue-700">{formatCurrency(t.revenueBilled)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-600">Collected</span>
                      <span className="text-sm font-semibold text-emerald-700">{formatCurrency(t.revenueCollected)}</span>
                    </div>
                    {t.emergencyCompleted > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-600">Emergency Jobs</span>
                        <span className="text-sm font-semibold text-red-600">⚡ {t.emergencyCompleted}</span>
                      </div>
                    )}
                  </div>
                  {/* Completion bar */}
                  <div className="mt-4">
                    <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Full leaderboard table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-bold text-slate-700">Full Leaderboard</h2>
          <span className="text-xs text-slate-400 ml-auto">Click column headers to sort</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-semibold w-8">#</th>
                <th className="text-left px-4 py-3 font-semibold">Technician</th>
                {cols.map(col => (
                  <th
                    key={col.key}
                    className="text-right px-4 py-3 font-semibold cursor-pointer hover:text-slate-700 select-none whitespace-nowrap"
                    onClick={() => toggleSort(col.key)}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {col.icon}
                      {col.label}
                      {sortKey === col.key
                        ? sortDir === 'desc'
                          ? <ChevronDown className="w-3 h-3" />
                          : <ChevronUp className="w-3 h-3" />
                        : <span className="w-3 h-3" />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((t, i) => {
                const rate = completionRate(t)
                return (
                  <tr key={t.userId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-400 font-bold text-xs">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0">
                          {initials(t.name)}
                        </div>
                        <span className="font-semibold text-slate-900">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-700 font-bold text-sm">
                        {t.completedComplaints}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {t.activeComplaints > 0 ? (
                        <span className="text-blue-600 font-semibold">{t.activeComplaints}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold ${rate >= 80 ? 'text-green-700' : rate >= 50 ? 'text-amber-700' : 'text-red-600'}`}>
                          {rate}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">{t.workOrders || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {t.emergencyCompleted > 0 ? (
                        <span className="text-red-600 font-semibold">⚡ {t.emergencyCompleted}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">
                      {t.revenueBilled > 0 ? formatCurrency(t.revenueBilled) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                      {t.revenueCollected > 0 ? formatCurrency(t.revenueCollected) : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
