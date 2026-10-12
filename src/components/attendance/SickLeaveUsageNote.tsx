'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle } from 'lucide-react'

interface Usage {
  used: number
  limit: number
  remaining: number
}

/**
 * Shows a staff member's sick-leave usage for the year of the date being marked.
 * Warns — never blocks — once the 15-day annual allowance is exhausted.
 */
export function SickLeaveUsageNote({ staffId, year }: { staffId: string | null; year: number | null }) {
  const [usage, setUsage] = useState<Usage | null>(null)

  useEffect(() => {
    if (!staffId || !year) {
      setUsage(null)
      return
    }
    let cancelled = false
    fetch(`/api/attendance/sick-leave-usage?staff_id=${staffId}&year=${year}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setUsage(typeof d.used === 'number' ? d : null) })
      .catch(() => { if (!cancelled) setUsage(null) })
    return () => { cancelled = true }
  }, [staffId, year])

  if (!usage) return null

  if (usage.remaining > 0) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-teal-50 border border-teal-200 px-3 py-2.5">
        <CheckCircle2 className="w-4 h-4 text-teal-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-teal-800">
          Sick leave this year: <strong>{usage.used}</strong> of {usage.limit} days used ·{' '}
          <strong>{usage.remaining}</strong> remaining.
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
      <p className="text-xs text-amber-800">
        Annual sick leave limit reached — <strong>{usage.used}</strong> of {usage.limit} days already used.
        You can still save, but this will exceed the {usage.limit}-day allowance.
      </p>
    </div>
  )
}
