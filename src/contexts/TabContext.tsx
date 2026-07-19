'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface Tab { id: string; url: string; label: string }

interface TabContextValue {
  tabs: Tab[]
  activeTabId: string | null
  openTab: (url: string, label: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
}

const TabContext = createContext<TabContextValue | null>(null)

export function useTabContext() {
  const ctx = useContext(TabContext)
  if (!ctx) throw new Error('Must be inside TabProvider')
  return ctx
}

const LABEL_MAP: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/complaints': 'Complaints',
  '/work-orders': 'Work Orders',
  '/customers': 'Customers',
  '/finance/invoices': 'Invoices',
  '/finance/payments': 'Payments',
  '/finance/receivables': 'Receivables',
  '/finance/ledger': 'Customer Ledger',
  '/finance/outstanding': 'Outstanding',
  '/finance/opening-receivables': 'Opening Receivables',
  '/finance/expenses': 'Expenses',
  '/finance/cash-book': 'Cash Book',
  '/finance/bank-book': 'Bank Book',
  '/finance/transfers': 'Fund Transfers',
  '/finance/owner-withdrawals': 'Owner Withdrawals',
  '/amc': 'AMC Contracts',
  '/inventory': 'Inventory',
  '/inventory/purchase-invoices': 'Purchase Invoices',
  '/inventory/opening-stock': 'Opening Stock',
  '/inventory/stock-trial': 'Stock Trial',
  '/suppliers': 'Suppliers',
  '/suppliers/purchase-register': 'Purchase Register',
  '/suppliers/advances': 'Supplier Advances',
  '/suppliers/vendor-payments': 'Vendor Payments',
  '/suppliers/vendor-outstanding': 'Vendor Outstanding',
  '/suppliers/vendor-ledger': 'Vendor Ledger',
  '/suppliers/opening-payables': 'Opening Payables',
  '/staff': 'Staff',
  '/staff/locations': 'Tech Locations',
  '/staff/ledger': 'Staff Ledger',
  '/my-attendance': 'My Attendance',
  '/attendance': 'Attendance',
  '/payroll': 'Payroll',
  '/payroll/process': 'Payslips',
  '/payroll/my-payslips': 'My Payslips',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/settings/company': 'Company',
  '/settings/audit-trail': 'Audit Trail',
  '/user-guide': 'User Guide',
}

export function labelForPath(path: string): string {
  const clean = path.split('?')[0]
  if (LABEL_MAP[clean]) return LABEL_MAP[clean]
  for (const [prefix, label] of Object.entries(LABEL_MAP)) {
    if (clean.startsWith(prefix + '/')) return label
  }
  return 'Page'
}

let _id = 0
function nextId() { return String(++_id) }

export function TabProvider({ children, initialPath }: { children: ReactNode; initialPath: string }) {
  const first: Tab = { id: nextId(), url: initialPath, label: labelForPath(initialPath) }
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

  return (
    <TabContext.Provider value={{ tabs, activeTabId, openTab, closeTab, setActiveTab: setActiveTabId }}>
      {children}
    </TabContext.Provider>
  )
}
