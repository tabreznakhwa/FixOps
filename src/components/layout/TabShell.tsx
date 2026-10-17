'use client'

import { useRef } from 'react'
import { useTabContext } from '@/contexts/TabContext'

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

// Documents (DocumentLink) open as real OS popup windows via window.open(),
// including when clicked from inside one of these iframes — that's native
// top-level navigation, not nested in the iframe — so no postMessage
// handshake back to this shell is needed here.
export function TabShell() {
  const { tabs, activeTabId, updateTabUrl } = useTabContext()
  const frames = useRef(new Map<string, HTMLIFrameElement>())

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
