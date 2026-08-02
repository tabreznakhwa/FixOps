'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export function BackButton({
  fallbackHref,
  label = 'Back',
}: {
  /** The destination. Always used — Back never consults browser history. */
  fallbackHref: string
  label?: string
}) {
  const router = useRouter()

  // This app renders every module inside an iframe with a patched history API
  // (see TabModeGuard / IFRAME_GUARD in the dashboard layout), so the history
  // stack holds edit forms, "new" forms and duplicate entries left behind by
  // post-save router.replace() calls. history.back() therefore lands somewhere
  // arbitrary — most visibly on the edit page the user just saved.
  //
  // Every call site already passes the destination it wants, so navigate there
  // directly and deterministically instead of guessing from history.
  return (
    <button
      type="button"
      onClick={() => router.push(fallbackHref)}
      className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
    >
      <ArrowLeft className="w-4 h-4" /> {label}
    </button>
  )
}
