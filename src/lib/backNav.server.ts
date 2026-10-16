import 'server-only'

import { redirect, RedirectType } from 'next/navigation'
import { safeReturnTo, type ReturnToValue } from '@/lib/backNav'

/** Complete a Server Action without leaving its form in iframe history. */
export function replaceRedirect(
  destination: ReturnToValue,
  fallbackHref: string,
): never {
  redirect(safeReturnTo(destination) ?? fallbackHref, RedirectType.replace)
}
