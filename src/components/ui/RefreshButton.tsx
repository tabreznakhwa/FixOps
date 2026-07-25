'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

export function RefreshButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [spinning, setSpinning] = useState(false)

  function handleClick() {
    setSpinning(true)
    startTransition(() => {
      router.refresh()
    })
    window.setTimeout(() => setSpinning(false), 600)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label="Refresh"
      title="Refresh"
      className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition disabled:opacity-60"
    >
      <RefreshCw className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} />
    </button>
  )
}
