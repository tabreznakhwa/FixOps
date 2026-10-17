'use client'

import { useEffect, useRef, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { useTabContext } from '@/contexts/TabContext'
import { tabDomId, tabPanelDomId } from '@/components/layout/TabShell'

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, closeAllTabs } = useTabContext()
  const tabButtons = useRef(new Map<string, HTMLButtonElement>())
  const previousActiveId = useRef(activeTabId)

  useEffect(() => {
    if (previousActiveId.current !== activeTabId && activeTabId) {
      tabButtons.current.get(activeTabId)?.focus()
      previousActiveId.current = activeTabId
    }
  }, [activeTabId])

  function moveFrom(id: string, delta: number) {
    const index = tabs.findIndex(tab => tab.id === id)
    if (index === -1) return
    const next = tabs[(index + delta + tabs.length) % tabs.length]
    setActiveTab(next.id)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      moveFrom(id, 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      moveFrom(id, -1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveTab(tabs[0].id)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveTab(tabs[tabs.length - 1].id)
    } else if (event.key === 'Delete' && tabs.length > 1) {
      event.preventDefault()
      closeTab(id)
    }
  }

  return (
    <div
      className="flex items-stretch bg-white border-b border-slate-200 flex-shrink-0"
      style={{ height: 36 }}
    >
      <div
        role="tablist"
        aria-label="Open pages"
        aria-orientation="horizontal"
        className="flex items-stretch overflow-x-auto flex-1"
        style={{ scrollbarWidth: 'none' }}
      >
        {tabs.map(tab => {
          const active = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              className={`relative flex items-center h-full border-r border-slate-200 flex-shrink-0 max-w-[180px] group transition-colors ${
                active
                  ? 'bg-slate-50 text-slate-900 font-semibold'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 bg-white'
              }`}
            >
              {active && <span aria-hidden="true" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t" />}
              <button
                ref={(button) => {
                  if (button) tabButtons.current.set(tab.id, button)
                  else tabButtons.current.delete(tab.id)
                }}
                id={tabDomId(tab.id)}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={tabPanelDomId(tab.id)}
                tabIndex={active ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleKeyDown(event, tab.id)}
                className="truncate flex-1 h-full pl-3 pr-1 text-left text-xs cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
              >
                {tab.label}
              </button>
              {tabs.length > 1 && (
                <button
                  type="button"
                  aria-label={`Close ${tab.label} tab`}
                  title={`Close ${tab.label} tab`}
                  onClick={() => closeTab(tab.id)}
                  className={`mr-2 flex-shrink-0 w-4 h-4 rounded flex items-center justify-center hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-all ${
                    active
                      ? 'opacity-50 hover:opacity-100 focus:opacity-100'
                      : 'opacity-0 group-hover:opacity-50 group-focus-within:opacity-50 hover:!opacity-100 focus:!opacity-100'
                  }`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {tabs.length > 1 && (
        <button
          type="button"
          onClick={closeAllTabs}
          aria-label="Close all tabs"
          title="Close all tabs"
          className="flex-shrink-0 flex items-center gap-1 px-3 h-full border-l border-slate-200 text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 transition-colors"
        >
          <X className="w-3 h-3" />
          <span>Close all</span>
        </button>
      )}
    </div>
  )
}
