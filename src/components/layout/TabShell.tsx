'use client'

import { useTabContext } from '@/contexts/TabContext'

function tabSrc(url: string) {
  if (url.includes('__tab=')) return url
  return url.includes('?') ? `${url}&__tab=1` : `${url}?__tab=1`
}

export function TabShell() {
  const { tabs, activeTabId } = useTabContext()

  return (
    <div className="flex-1 relative overflow-hidden">
      {tabs.map(tab => (
        <iframe
          key={tab.id}
          src={tabSrc(tab.url)}
          title={tab.label}
          className="absolute inset-0 w-full h-full border-0"
          style={{ display: activeTabId === tab.id ? 'block' : 'none' }}
        />
      ))}
    </div>
  )
}
