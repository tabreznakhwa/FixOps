'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Calendar } from 'lucide-react'

function toISODate(d: Date) {
  return d.toISOString().split('T')[0]
}

function startOfWeek(d: Date) {
  const date = new Date(d)
  const day = date.getDay() // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day // Monday as start of week
  date.setDate(date.getDate() + diff)
  return date
}

const PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: 'Today', range: () => { const t = new Date(); return { from: toISODate(t), to: toISODate(t) } } },
  { label: 'This Week', range: () => { const t = new Date(); return { from: toISODate(startOfWeek(t)), to: toISODate(t) } } },
  { label: 'This Month', range: () => { const t = new Date(); return { from: toISODate(new Date(t.getFullYear(), t.getMonth(), 1)), to: toISODate(t) } } },
  { label: 'This Year', range: () => { const t = new Date(); return { from: toISODate(new Date(t.getFullYear(), 0, 1)), to: toISODate(t) } } },
]

export function DateRangeFilter({ basePath, from, to }: { basePath: string; from?: string; to?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [customFrom, setCustomFrom] = useState(from ?? '')
  const [customTo, setCustomTo] = useState(to ?? '')

  const navigate = (newFrom: string | null, newTo: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (newFrom) params.set('from', newFrom); else params.delete('from')
    if (newTo) params.set('to', newTo); else params.delete('to')
    router.push(`${basePath}?${params.toString()}`)
  }

  const activePreset = PRESETS.find((p) => {
    const r = p.range()
    return r.from === from && r.to === to
  })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold pr-1">
        <Calendar className="w-3.5 h-3.5" /> Date
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
