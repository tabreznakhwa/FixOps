'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Calendar } from 'lucide-react'

const TZ = 'Asia/Kuwait'

function kwDate(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function startOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow)
}

const PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: 'Today', range: () => { const t = kwDate(); return { from: t, to: t } } },
  { label: 'Yesterday', range: () => { const t = addDays(kwDate(), -1); return { from: t, to: t } } },
  { label: 'This Week', range: () => { const t = kwDate(); return { from: startOfWeek(t), to: t } } },
  { label: 'This Month', range: () => { const t = kwDate(); return { from: t.slice(0, 7) + '-01', to: t } } },
  { label: 'This Year', range: () => { const t = kwDate(); return { from: t.slice(0, 4) + '-01-01', to: t } } },
]

export function DateRangeFilter({
  basePath, from, to, label = 'Date', fromKey = 'from', toKey = 'to',
}: {
  basePath: string; from?: string; to?: string; label?: string; fromKey?: string; toKey?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [customFrom, setCustomFrom] = useState(from ?? '')
  const [customTo, setCustomTo] = useState(to ?? '')

  const navigate = (newFrom: string | null, newTo: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (newFrom) params.set(fromKey, newFrom); else params.delete(fromKey)
    if (newTo) params.set(toKey, newTo); else params.delete(toKey)
    router.push(`${basePath}?${params.toString()}`)
  }

  const activePreset = PRESETS.find((p) => {
    const r = p.range()
    return r.from === from && r.to === to
  })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold pr-1">
        <Calendar className="w-3.5 h-3.5" /> {label}
      </div>
      <button
        onClick={() => navigate(null, null)}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${!from && !to ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
      >
        All Time
      </button>
      {PRESETS.map((p) => (
        <button
          key={p.label}
          onClick={() => { const r = p.range(); setCustomFrom(r.from); setCustomTo(r.to); navigate(r.from, r.to) }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activePreset?.label === p.label ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1.5 ml-1">
        <input
          type="date"
          value={customFrom}
          onChange={(e) => setCustomFrom(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-slate-400 text-xs">to</span>
        <input
          type="date"
          value={customTo}
          onChange={(e) => setCustomTo(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => navigate(customFrom || null, customTo || null)}
          disabled={!customFrom && !customTo}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  )
}
