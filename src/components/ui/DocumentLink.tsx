'use client'

import Link from 'next/link'
import { parseDocumentRoute } from '@/lib/documentTabs'
import type { ComponentProps, MouseEvent } from 'react'

type Props = Omit<ComponentProps<typeof Link>, 'href'> & {
  href: string
  tabLabel?: string
}

const POPUP_FEATURES = 'width=1200,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes'

/**
 * A real anchor for read-only formal documents. A plain click opens the
 * document in its own standalone popup window (reusing one window per
 * document via a stable name) instead of navigating the current page, so
 * list pages never lose scroll/filter state. Modifier clicks, middle-click,
 * target and download behavior remain native.
 */
export function DocumentLink({ href, tabLabel, prefetch = false, onClick, ...props }: Props) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (event.defaultPrevented) return
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

    const route = parseDocumentRoute(href)
    if (!route) return

    event.preventDefault()
    const url = new URL(route.href, window.location.origin)
    url.searchParams.set('__popup', '1')
    const win = window.open(`${url.pathname}${url.search}${url.hash}`, route.tabKey, POPUP_FEATURES)
    win?.focus()
  }

  return <Link {...props} href={href} prefetch={prefetch} onClick={handleClick} />
}
