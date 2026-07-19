'use client'

import { usePathname } from 'next/navigation'
import { TabProvider } from '@/contexts/TabContext'
import type { ReactNode } from 'react'

export function TabInitializer({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return <TabProvider initialPath={pathname}>{children}</TabProvider>
}
