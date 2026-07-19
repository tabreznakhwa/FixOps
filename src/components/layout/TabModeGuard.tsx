'use client'
import { useEffect } from 'react'

// Ensures __tab=1 stays in the URL throughout all in-iframe navigation
// so that router.refresh() RSC fetches still hit the tab-mode layout branch.
export function TabModeGuard() {
  useEffect(() => {
    function addTab(url: string | URL | null | undefined): string | URL | null | undefined {
      if (!url || typeof url !== 'string') return url
      if (url.startsWith('#') || url.startsWith('javascript')) return url
      if (url.includes('__tab=')) return url
      return url.includes('?') ? `${url}&__tab=1` : `${url}?__tab=1`
    }

    const origPush = history.pushState.bind(history)
    const origReplace = history.replaceState.bind(history)

    history.pushState = function (state: unknown, title: string, url?: string | URL | null) {
      return origPush(state, title, addTab(url as string))
    }
    history.replaceState = function (state: unknown, title: string, url?: string | URL | null) {
      return origReplace(state, title, addTab(url as string))
    }

    return () => {
      history.pushState = origPush
      history.replaceState = origReplace
    }
  }, [])

  return null
}
