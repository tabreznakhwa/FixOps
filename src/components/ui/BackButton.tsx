'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export function BackButton({
  fallbackHref,
  label = 'Back',
}: {
  fallbackHref: string
  label?: string
}) {
  const router = useRouter()

  function handleClick() {
    const cameFromSameOrigin =
      typeof window !== 'undefined' &&
      window.history.length > 1 &&
      document.referrer &&
      new URL(document.referrer).origin === window.location.origin

    if (cameFromSameOrigin) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
    >
      <ArrowLeft className="w-4 h-4" /> {label}
    </button>
  )
}
