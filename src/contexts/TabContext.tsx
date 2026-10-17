'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import {
  createInitialTab,
  openOrFocusTab,
  syncTabUrl,
  type Tab,
} from '@/contexts/tabState'

export type { Tab } from '@/contexts/tabState'

interface TabContextValue {
  tabs: Tab[]
  activeTabId: string | null
  openTab: (url: string, label: string, tabKey?: string) => void
  updateTabUrl: (id: string, url: string) => void
  closeTab: (id: string) => void
  closeAllTabs: () => void
  setActiveTab: (id: string) => void
}

const TabContext = createContext<TabContextValue | null>(null)

export function useTabContext() {
  const ctx = useContext(TabContext)
  if (!ctx) throw new Error('Must be inside TabProvider')
  return ctx
}

export function TabProvider({ children, initialPath }: { children: ReactNode; initialPath: string }) {
  const first = createInitialTab(initialPath)
  const [tabs, setTabs] = useState<Tab[]>([first])
  const [activeTabId, setActiveTabId] = useState<string>(first.id)

  const openTab = useCallback((url: string, label: string, tabKey?: string) => {
    setTabs(prev => {
      const result = openOrFocusTab(prev, url, label, tabKey)
      setActiveTabId(result.activeTabId)
      return result.tabs
    })
  }, [])

  const updateTabUrl = useCallback((id: string, url: string) => {
    setTabs(prev => syncTabUrl(prev, id, url))
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev
      const idx = prev.findIndex(t => t.id === id)
      if (idx === -1) return prev
      const next = prev.filter(t => t.id !== id)
      setActiveTabId(cur => {
        if (cur !== id) return cur
        return next[Math.min(idx, next.length - 1)].id
      })
      return next
    })
  }, [])

  const closeAllTabs = useCallback(() => {
    const dashboard = createInitialTab('/dashboard')
    setTabs([dashboard])
    setActiveTabId(dashboard.id)
  }, [])

  const setActiveTab = useCallback((id: string) => {
    setActiveTabId(current => tabs.some(tab => tab.id === id) ? id : current)
  }, [tabs])

  return (
    <TabContext.Provider value={{ tabs, activeTabId, openTab, updateTabUrl, closeTab, closeAllTabs, setActiveTab }}>
      {children}
    </TabContext.Provider>
  )
}
