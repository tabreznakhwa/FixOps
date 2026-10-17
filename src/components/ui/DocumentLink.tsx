'use client'

import Link from 'next/link'
import {
  createDocumentTabRequest,
  isDocumentTabAck,
  parseDocumentRoute,
} from '@/lib/documentTabs'
import { useEffect, useRef, type ComponentProps } from 'react'

type PendingRequest = {
  timeout: ReturnType<typeof setTimeout>
  listener: (event: MessageEvent) => void
}

type Props = Omit<ComponentProps<typeof Link>, 'href' | 'onNavigate'> & {
  href: string
  tabLabel?: string
}

const ACK_TIMEOUT_MS = 750

function requestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * A real anchor for read-only formal documents. Inside a managed iframe, a
 * plain navigation asks the outer shell to open an application tab; modifier,
 * middle-click, target and download behavior remains native.
 */
export function DocumentLink({ href, tabLabel, prefetch = false, ...props }: Props) {
  const pending = useRef(new Map<string, PendingRequest>())

  useEffect(() => {
    const requests = pending.current
    return () => {
      for (const request of requests.values()) {
        clearTimeout(request.timeout)
        window.removeEventListener('message', request.listener)
      }
      requests.clear()
    }
  }, [])

  return (
    <Link
      {...props}
      href={href}
      prefetch={prefetch}
      onNavigate={(event) => {
        // Next only calls onNavigate for same-origin SPA navigations; modified
        // clicks, downloads, external URLs and non-_self targets stay native.
        if (window.parent === window) return

        const route = parseDocumentRoute(href)
        if (!route) return

        event.preventDefault()
        const id = requestId()
        let settled = false

        const cleanup = () => {
          const request = pending.current.get(id)
          if (!request) return
          clearTimeout(request.timeout)
          window.removeEventListener('message', request.listener)
          pending.current.delete(id)
        }

        const fallback = () => {
          if (settled) return
          settled = true
          cleanup()
          window.location.assign(route.href)
        }

        const listener = (message: MessageEvent) => {
          if (
            message.origin !== window.location.origin ||
            message.source !== window.parent ||
            !isDocumentTabAck(message.data) ||
            message.data.requestId !== id
          ) return

          settled = true
          cleanup()
        }

        const timeout = setTimeout(fallback, ACK_TIMEOUT_MS)
        pending.current.set(id, { timeout, listener })
        window.addEventListener('message', listener)

        try {
          window.parent.postMessage(
            createDocumentTabRequest(id, route, tabLabel ?? route.fallbackLabel),
            window.location.origin,
          )
        } catch {
          fallback()
        }
      }}
    />
  )
}
