'use client'

import { useEffect, useRef } from 'react'
import { useTabContext } from '@/contexts/TabContext'
import {
  createDocumentTabAck,
  isDocumentTabOpenRequest,
  parseDocumentRoute,
  sanitizeDocumentLabel,
} from '@/lib/documentTabs'

export function tabDomId(tabId: string) {
  return `app-tab-${tabId}`
}

export function tabPanelDomId(tabId: string) {
  return `app-tab-panel-${tabId}`
}

export function tabSrc(url: string) {
  const parsed = new URL(url, 'https://fixops.internal')
  parsed.searchParams.set('__tab', '1')
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}

export function TabShell() {
  const { tabs, activeTabId, openTab, updateTabUrl } = useTabContext()
  const frames = useRef(new Map<string, HTMLIFrameElement>())

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || !isDocumentTabOpenRequest(event.data)) return

      const sourceTab = tabs.find(tab => frames.current.get(tab.id)?.contentWindow === event.source)
      if (!sourceTab) return

      const route = parseDocumentRoute(event.data.href)
      if (!route) return

      const label = sanitizeDocumentLabel(event.data.label, route.fallbackLabel)
      openTab(route.href, label, route.tabKey)

      const sourceWindow = event.source as Window | null
      if (sourceWindow && typeof sourceWindow.postMessage === 'function') {
        sourceWindow.postMessage(createDocumentTabAck(event.data.requestId), event.origin)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [openTab, tabs])

  function syncTabUrl(tabId: string, frame: HTMLIFrameElement) {
    try {
      const location = frame.contentWindow?.location
      if (!location || location.origin !== window.location.origin) return
      updateTabUrl(tabId, `${location.pathname}${location.search}${location.hash}`)
    } catch {
      // Same-origin dashboard frames are expected; ignore transient navigation states.
    }
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      {tabs.map(tab => {
        const active = activeTabId === tab.id
        return (
          <div
            key={tab.id}
            id={tabPanelDomId(tab.id)}
            role="tabpanel"
            aria-labelledby={tabDomId(tab.id)}
            hidden={!active}
            className="absolute inset-0"
          >
            <iframe
              ref={(frame) => {
                if (frame) frames.current.set(tab.id, frame)
                else frames.current.delete(tab.id)
              }}
              src={tabSrc(tab.url)}
              title={tab.label}
              onLoad={(event) => syncTabUrl(tab.id, event.currentTarget)}
              className="w-full h-full border-0"
            />
          </div>
        )
      })}
    </div>
  )
}
