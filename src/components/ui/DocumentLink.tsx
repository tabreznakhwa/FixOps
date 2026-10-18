'use client'

import Link from 'next/link'
import { parseDocumentRoute } from '@/lib/documentTabs'
import type { ComponentProps, MouseEvent } from 'react'

type Props = Omit<ComponentProps<typeof Link>, 'href'> & {
  href: string
  tabLabel?: string
}

const POPUP_FEATURES = 'width=1200,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes'
const MOBILE_DOCUMENT_QUERY = '(max-width: 767px), (hover: none) and (pointer: coarse)'

/** Mobile browsers do not provide reliable independent popup windows. */
export function shouldNavigateDocumentInCurrentWindow(
  matchMedia: ((query: string) => Pick<MediaQueryList, 'matches'>) | undefined,
): boolean {
  return matchMedia?.(MOBILE_DOCUMENT_QUERY).matches ?? false
}

/**
 * A real anchor for formal documents. Desktop plain-clicks open a standalone
 * popup window (reusing one window per document via a stable name), while
 * phone/tablet clicks navigate the current window because mobile browsers do
 * not preserve desktop-style popup windows reliably. Modifier clicks,
 * middle-click, target and download behavior remain native.
 */
export function DocumentLink({ href, tabLabel, prefetch = false, onClick, ...props }: Props) {
  void tabLabel
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (event.defaultPrevented) return
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

    const route = parseDocumentRoute(href)
    if (!route || shouldNavigateDocumentInCurrentWindow(window.matchMedia?.bind(window))) return

    event.preventDefault()
    const url = new URL(route.href, window.location.origin)
    url.searchParams.set('__popup', '1')
    const win = window.open(`${url.pathname}${url.search}${url.hash}`, route.tabKey, POPUP_FEATURES)
    win?.focus()
  }

  return <Link {...props} href={href} prefetch={prefetch} onClick={handleClick} />
}
