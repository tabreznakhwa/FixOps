'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { labelForPath } from '@/lib/backNav'

export interface Tab { id: string; url: string; label: string }

interface TabContextValue {
  tabs: Tab[]
  activeTabId: string | null
  openTab: (url: string, label: string) => void
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

let _id = 0
function nextId() { return String(++_id) }

export function TabProvider({ children, initialPath }: { children: ReactNode; initialPath: string }) {
  const first: Tab = { id: nextId(), url: initialPath, label: labelForPath(initialPath, 'Page') }
  const [tabs, setTabs] = useState<Tab[]>([first])
  const [activeTabId, setActiveTabId] = useState<string>(first.id)

  const openTab = useCallback((url: string, label: string) => {
    setTabs(prev => {
      const cleanUrl = url.split('?')[0]
      const existing = prev.find(t => t.url.split('?')[0] === cleanUrl)
      if (existing) {
        setActiveTabId(existing.id)
        return prev
      }
      const tab: Tab = { id: nextId(), url, label }
      setActiveTabId(tab.id)
      return [...prev, tab]
    })
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev
      const idx = prev.findIndex(t => t.id === id)
      const next = prev.filter(t => t.id !== id)
      setActiveTabId(cur => {
        if (cur !== id) return cur
        return next[Math.min(idx, next.length - 1)].id
      })
      return next
    })
  }, [])

  const closeAllTabs = useCallback(() => {
    const dashboard: Tab = { id: nextId(), url: '/dashboard', label: 'Dashboard' }
    setTabs([dashboard])
    setActiveTabId(dashboard.id)
  }, [])

  return (
    <TabContext.Provider value={{ tabs, activeTabId, openTab, closeTab, closeAllTabs, setActiveTab: setActiveTabId }}>
      {children}
    </TabContext.Provider>
  )
}
