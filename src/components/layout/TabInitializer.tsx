'use client'

import { TabProvider } from '@/contexts/TabContext'
import type { ReactNode } from 'react'

export function TabInitializer({ children }: { children: ReactNode }) {
  return <TabProvider initialPath="/dashboard">{children}</TabProvider>
}
