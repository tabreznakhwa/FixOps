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
      const pathBeforeBack = window.location.pathname + window.location.search
      router.back()

      // Safety net: this app renders module tabs inside iframes with a patched
      // history API (see TabModeGuard), where history.back() can occasionally
      // land nowhere. If the URL hasn't actually changed shortly after calling
      // back(), force-navigate to the known-good fallback instead of leaving
      // the user stuck.
      window.setTimeout(() => {
        const pathNow = window.location.pathname + window.location.search
        if (pathNow === pathBeforeBack) {
          router.push(fallbackHref)
        }
      }, 350)
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
