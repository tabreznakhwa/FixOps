'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { CalendarCheck } from 'lucide-react'

/** "As On" date for the vendor-wise outstanding report. */
export function AsOnFilter({ asOn, today }: { asOn: string; today: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(asOn)

  function apply(next: string | null) {
    const sp = new URLSearchParams(searchParams.toString())
    // Today is the default — keep it out of the URL.
    if (next && next !== today) sp.set('as_on', next); else sp.delete('as_on')
    const qs = sp.toString()
    router.push(`/suppliers/vendor-outstanding${qs ? `?${qs}` : ''}`)
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold">
        <CalendarCheck className="w-3.5 h-3.5" /> As On
      </div>
      <input
        type="date"
        value={value}
        max={today}
        onChange={(e) => setValue(e.target.value)}
        className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        onClick={() => apply(value || null)}
        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
      >
        Apply
      </button>
      {asOn !== today && (
        <button
          onClick={() => { setValue(today); apply(null) }}
          className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold rounded-lg transition-colors"
        >
          Today
        </button>
      )}
    </div>
  )
}
