'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { currentPath } from '@/lib/backNav'

/** The current iframe page as a clean origin for links to child routes. */
export function useCurrentPath(): string {
  return currentPath(usePathname(), useSearchParams())
}
