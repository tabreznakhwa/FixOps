'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { safeReturnTo } from '@/lib/backNav'

export function BackButton({
  href,
  fallbackHref,
  label = 'Back',
}: {
  /** The destination. Always used — Back never consults browser history. */
  href?: string
  /** @deprecated Use href. Kept while existing static call sites migrate. */
  fallbackHref?: string
  label?: string
}) {
  const router = useRouter()
  const destination = safeReturnTo(href ?? fallbackHref) ?? '/dashboard'

  // Two coexisting mechanisms make browser history an unreliable "back"
  // source: documents open in their own popup window (DocumentLink /
  // popupGuard in the dashboard layout), where the window's own history
  // stack holds edit forms, "new" forms and duplicate entries left behind by
  // post-save router.replace() calls; and main modules open as in-app tabs
  // (TabShell / tabModeGuard), whose iframes navigate independently of the
  // outer page's address bar. Either way, history.back() lands somewhere
  // arbitrary — most visibly on the edit page the user just saved.
  //
  // Every call site already passes the destination it wants, so navigate there
  // directly and deterministically instead of guessing from history.
  return (
    <button
      type="button"
      onClick={() => router.replace(destination)}
      className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
    >
      <ArrowLeft className="w-4 h-4" /> {label}
    </button>
  )
}
