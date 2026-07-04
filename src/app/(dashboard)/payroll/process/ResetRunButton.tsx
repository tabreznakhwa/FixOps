'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Loader2 } from 'lucide-react'

export function ResetRunButton({ runId }: { runId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleReset() {
    if (!confirm('Reset this payroll run? This will delete all payslips and restore advance balances so you can re-process with updated data. This cannot be undone.')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/payroll/run/${runId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? 'Failed to reset'); return }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleReset}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold rounded-lg hover:bg-amber-100 disabled:opacity-60 transition-colors"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
      Reset & Re-process
    </button>
  )
}
