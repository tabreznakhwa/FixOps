'use client'

import { type ReactNode } from 'react'
import { TabProvider } from '@/contexts/TabContext'
import { TabBar } from '@/components/layout/TabBar'
import { TabShell } from '@/components/layout/TabShell'

interface Props {
  isTabMode: boolean
  sidebar: ReactNode
  assigner: ReactNode
  children: ReactNode
}

export function TabShellOrContent({ isTabMode, sidebar, assigner, children }: Props) {
  if (isTabMode) {
    return (
      <div className="min-h-screen bg-slate-50 overflow-y-auto">
        {children}
      </div>
    )
  }

  return (
    <TabProvider initialPath="/dashboard">
      <div className="flex h-screen bg-slate-50 overflow-hidden">
        {sidebar}
        <div className="flex-1 flex flex-col min-w-0 lg:ml-14 overflow-hidden">
          <TabBar />
          <TabShell />
        </div>
      </div>
      {assigner}
    </TabProvider>
  )
}
