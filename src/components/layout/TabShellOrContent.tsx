'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'
import { TabProvider } from '@/contexts/TabContext'
import { TabBar } from '@/components/layout/TabBar'
import { TabShell } from '@/components/layout/TabShell'
import { TabModeGuard } from '@/components/layout/TabModeGuard'

function Inner({
  sidebar,
  assigner,
  children,
}: {
  sidebar: ReactNode
  assigner: ReactNode
  children: ReactNode
}) {
  const params = useSearchParams()
  const isTabMode = params.has('__tab')

  if (isTabMode) {
    return (
      <div className="min-h-screen bg-slate-50 overflow-y-auto">
        <TabModeGuard />
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

export function TabShellOrContent(props: {
  sidebar: ReactNode
  assigner: ReactNode
  children: ReactNode
}) {
  return (
    <Suspense>
      <Inner {...props} />
    </Suspense>
  )
}
