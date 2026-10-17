import { labelForPath, safeReturnTo } from '@/lib/backNav'
import { parseDocumentRoute } from '@/lib/documentTabs'

export interface Tab { id: string; url: string; label: string; tabKey: string }

let nextTabId = 0

function createTabId() {
  nextTabId += 1
  return String(nextTabId)
}

export function tabKeyForUrl(url: string) {
  const safe = safeReturnTo(url)
  if (!safe) return `url:${url}`
  return `path:${new URL(safe, 'https://fixops.internal').pathname}`
}

export function createTab(url: string, label: string, tabKey?: string): Tab {
  return {
    id: createTabId(),
    url,
    label,
    tabKey: tabKey ?? tabKeyForUrl(url),
  }
}

export function createInitialTab(initialPath: string): Tab {
  return createTab(initialPath, labelForPath(initialPath, 'Page'))
}

export function openOrFocusTab(
  tabs: Tab[],
  url: string,
  label: string,
  tabKey?: string,
): { tabs: Tab[]; activeTabId: string } {
  const key = tabKey ?? tabKeyForUrl(url)
  const existing = tabs.find((tab) => tab.tabKey === key)

  if (existing) {
    return {
      tabs: tabs.map((tab) => tab.id === existing.id
        ? { ...tab, url, label }
        : tab),
      activeTabId: existing.id,
    }
  }

  const tab = createTab(url, label, key)
  return { tabs: [...tabs, tab], activeTabId: tab.id }
}

export function syncTabUrl(tabs: Tab[], id: string, url: string): Tab[] {
  const safe = safeReturnTo(url)
  if (!safe) return tabs

  return tabs.map((tab) => {
    if (tab.id !== id) return tab

    const documentRoute = parseDocumentRoute(safe)
    if (documentRoute) {
      return {
        ...tab,
        url: documentRoute.href,
        label: tab.tabKey === documentRoute.tabKey ? tab.label : documentRoute.fallbackLabel,
        tabKey: documentRoute.tabKey,
      }
    }

    return {
      ...tab,
      url: safe,
      label: labelForPath(safe, 'Page'),
      tabKey: tabKeyForUrl(safe),
    }
  })
}
