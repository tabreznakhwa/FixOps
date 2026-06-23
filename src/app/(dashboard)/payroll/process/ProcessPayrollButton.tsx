'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export function ProcessPayrollButton({ month, year, staffCount }: { month: number; year: number; staffCount: number }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleProcess() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/payroll/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to process payroll')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleProcess}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-60 transition-colors whitespace-nowrap"
      >
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : `Process ${staffCount} Payslips`}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
