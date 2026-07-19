'use client'

import { X } from 'lucide-react'
import { useTabContext } from '@/contexts/TabContext'

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, closeAllTabs } = useTabContext()

  return (
    <div
      className="flex items-stretch bg-white border-b border-slate-200 flex-shrink-0"
      style={{ height: 36 }}
    >
      {/* Scrollable tab list */}
      <div className="flex items-stretch overflow-x-auto flex-1" style={{ scrollbarWidth: 'none' }}>
        {tabs.map(tab => {
          const active = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              role="tab"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1.5 px-3 h-full border-r border-slate-200 text-xs cursor-pointer select-none flex-shrink-0 max-w-[160px] group transition-colors ${
                active
                  ? 'bg-slate-50 text-slate-900 font-semibold'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 bg-white'
              }`}
            >
              {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t" />}
              <span className="truncate flex-1">{tab.label}</span>
              {tabs.length > 1 && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
                  className={`flex-shrink-0 w-4 h-4 rounded flex items-center justify-center hover:bg-slate-200 transition-all ${
                    active ? 'opacity-50 hover:opacity-100' : 'opacity-0 group-hover:opacity-50 hover:!opacity-100'
                  }`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Close all button — only shown when more than one tab is open */}
      {tabs.length > 1 && (
        <button
          type="button"
          onClick={closeAllTabs}
          title="Close all tabs"
          className="flex-shrink-0 flex items-center gap-1 px-3 h-full border-l border-slate-200 text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <X className="w-3 h-3" />
          <span>Close all</span>
        </button>
      )}
    </div>
  )
}
