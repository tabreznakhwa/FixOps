'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, MessageSquare, ClipboardList, FileText,
  CreditCard, Package, UserCheck, DollarSign, BarChart3, Settings,
  Wrench, ChevronDown, LogOut, Menu, X, FileBarChart, ShieldCheck,
  Building2, Hammer, CalendarCheck, Banknote, Landmark, AlertCircle,
  ShoppingCart, TrendingDown, Layers, Printer, BookOpen, Receipt, MapPin
} from 'lucide-react'
import { useState, useRef, type ElementType } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { type ModuleKey, type ModuleAccess } from '@/lib/permissions'

const navGroups: Array<{
  label: string
  module: ModuleKey
  icon: ElementType
  items: { href: string; label: string; icon: ElementType; exact?: boolean; excludeRoles?: string[]; onlyRoles?: string[] }[]
}> = [
  {
    label: 'Operations',
    module: 'operations' as const,
    icon: LayoutDashboard,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/complaints', label: 'Complaints', icon: MessageSquare },
      { href: '/work-orders', label: 'Work Orders', icon: ClipboardList },
      { href: '/customers', label: 'Customers', icon: Users },
    ],
  },
  {
    label: 'Finance',
    module: 'finance' as const,
    icon: Banknote,
    items: [
      { href: '/finance/invoices', label: 'Invoices', icon: FileText },
      { href: '/finance/payments', label: 'Payments', icon: CreditCard },
      { href: '/finance/receivables', label: 'Receivables', icon: DollarSign },
      { href: '/finance/ledger', label: 'Customer Ledger', icon: FileBarChart },
      { href: '/finance/outstanding', label: 'Bill-wise Outstanding', icon: AlertCircle },
      { href: '/finance/opening-receivables', label: 'Opening Receivables', icon: TrendingDown, excludeRoles: ['technician'] },
      { href: '/finance/expenses', label: 'Expenses', icon: Receipt, excludeRoles: ['technician'] },
      { href: '/finance/cash-book', label: 'Cash Book', icon: Banknote },
      { href: '/finance/bank-book', label: 'Bank Book', icon: Landmark },
      { href: '/amc', label: 'AMC Contracts', icon: ShieldCheck },
    ],
  },
  {
    label: 'Inventory & Assets',
    module: 'inventory' as const,
    icon: Package,
    items: [
      { href: '/inventory', label: 'Inventory', icon: Package, exact: true },
      { href: '/inventory/purchase-invoices', label: 'Purchase Invoices', icon: ShoppingCart, excludeRoles: ['technician'] },
      { href: '/inventory/opening-stock', label: 'Opening Stock', icon: Layers, excludeRoles: ['technician'] },
      { href: '/inventory/stock-trial', label: 'Stock Trial', icon: Layers, excludeRoles: ['technician'] },
      { href: '/suppliers', label: 'Suppliers & PO', icon: Building2, exact: true, excludeRoles: ['technician'] },
      { href: '/suppliers/purchase-register', label: 'Purchase Register', icon: ShoppingCart, excludeRoles: ['technician'] },
      { href: '/suppliers/vendor-payments', label: 'Vendor Payments', icon: TrendingDown, excludeRoles: ['technician'] },
      { href: '/suppliers/vendor-outstanding', label: 'Vendor Outstanding', icon: TrendingDown, excludeRoles: ['technician'] },
      { href: '/suppliers/vendor-ledger', label: 'Vendor Ledger', icon: TrendingDown, excludeRoles: ['technician'] },
      { href: '/suppliers/opening-payables', label: 'Opening Payables', icon: TrendingDown, excludeRoles: ['technician'] },
    ],
  },
  {
    label: 'HR & Payroll',
    module: 'hr' as const,
    icon: UserCheck,
    items: [
      { href: '/staff', label: 'Staff', icon: UserCheck, excludeRoles: ['technician', 'attendance_kiosk'] },
      { href: '/staff/locations', label: 'Technician Locations', icon: MapPin, excludeRoles: ['technician', 'attendance_kiosk'] },
      { href: '/attendance', label: 'Attendance', icon: CalendarCheck },
      { href: '/payroll', label: 'Payroll', icon: BarChart3, excludeRoles: ['attendance_kiosk'] },
      { href: '/payroll/process', label: 'Payslips', icon: Printer, excludeRoles: ['attendance_kiosk'] },
      { href: '/payroll/my-payslips', label: 'My Payslips', icon: Printer, onlyRoles: ['attendance_kiosk'] },
      { href: '/staff/ledger', label: 'Staff Ledger', icon: FileBarChart, excludeRoles: ['technician', 'attendance_kiosk'] },
    ],
  },
  {
    label: 'Reports',
    module: 'reports' as const,
    icon: BarChart3,
    items: [
      { href: '/reports', label: 'Reports', icon: Hammer },
    ],
  },
  {
    label: 'System',
    module: 'settings' as const,
    icon: Settings,
    items: [
      { href: '/settings', label: 'Settings', icon: Settings, exact: true },
      { href: '/settings/company', label: 'Company', icon: Building2 },
      { href: '/settings/audit-trail', label: 'Audit Trail', icon: FileBarChart },
      { href: '/user-guide', label: 'User Guide', icon: BookOpen },
    ],
  },
]

interface SidebarProps {
  user: { full_name: string; email: string; role: string; avatar_url?: string | null }
  moduleAccess: ModuleAccess
}

export function Sidebar({ user, moduleAccess }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileCollapsed, setMobileCollapsed] = useState<Record<string, boolean>>({})
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function openGroup(label: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setActiveGroup(label)
  }

  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setActiveGroup(null), 150)
  }

  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }

  function isGroupActive(group: typeof navGroups[0]) {
    return group.items.some(({ href, exact }) =>
      exact ? pathname === href : (pathname === href || pathname.startsWith(href + '/'))
    )
  }

  const visibleGroups = navGroups.filter((g) => (moduleAccess[g.module] ?? 'none') !== 'none')

  const activeGroupData = visibleGroups.find(g => g.label === activeGroup) ?? null
  const activeGroupItems = activeGroupData?.items.filter(
    ({ excludeRoles, onlyRoles }) =>
      !excludeRoles?.includes(user.role) && (!onlyRoles || onlyRoles.includes(user.role))
  ) ?? []

  return (
    <>
      {/* ── Desktop: Icon Rail ── */}
      <aside className="hidden lg:flex flex-col w-14 bg-slate-900 border-r border-slate-700/50 flex-shrink-0 fixed left-0 top-0 h-screen z-30">
        {/* Logo */}
        <div className="flex items-center justify-center py-4 border-b border-slate-700/50 flex-shrink-0">
          <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center">
            <Wrench className="w-4 h-4 text-white" />
          </div>
        </div>

        {/* Group Icon Buttons */}
        <nav className="flex-1 flex flex-col items-center py-3 gap-1 overflow-y-auto">
          {visibleGroups.map((group) => {
            const GroupIcon = group.icon
            const groupActive = isGroupActive(group)
            const isHovered = activeGroup === group.label
            return (
              <button
                key={group.label}
                title={group.label}
                onMouseEnter={() => openGroup(group.label)}
                onMouseLeave={scheduleClose}
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center transition-all flex-shrink-0',
                  groupActive
                    ? 'bg-blue-600 text-white'
                    : isHovered
                    ? 'bg-slate-700 text-slate-200'
                    : 'text-slate-500 hover:bg-slate-700/50 hover:text-slate-300'
                )}
              >
                <GroupIcon className="w-5 h-5" />
              </button>
            )
          })}
        </nav>

        {/* User Avatar */}
        <div className="flex-shrink-0 py-3 flex justify-center border-t border-slate-700/50">
          <div
            className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold cursor-default"
            title={`${user.full_name} · ${user.role.replace('_', ' ')}`}
          >
            {user.full_name.slice(0, 2).toUpperCase()}
          </div>
        </div>
      </aside>

      {/* ── Desktop: Flyout Panel ── */}
      {activeGroup && activeGroupData && (
        <div
          className="hidden lg:flex flex-col fixed left-14 top-0 h-screen w-56 bg-slate-900 border-r border-slate-700/50 z-20 shadow-2xl"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {/* Brand header — same height as icon rail logo area */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700/50 flex-shrink-0">
            <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <Wrench className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-sm leading-tight">FixOps</p>
              <p className="text-slate-500 text-xs">Maintenance System</p>
            </div>
          </div>

          {/* Section label */}
          <div className="px-4 pt-4 pb-1.5 flex-shrink-0">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {activeGroupData.label}
            </p>
          </div>

          {/* Links */}
          <nav className="flex-1 pb-2 px-2 space-y-0.5 overflow-y-auto">
            {activeGroupItems.map(({ href, label, icon: Icon, exact }) => {
              const active = exact ? pathname === href : (pathname === href || pathname.startsWith(href + '/'))
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setActiveGroup(null)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                    active
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/30'
                      : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                  )}
                >
                  <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-white' : 'text-slate-500 group-hover:text-slate-300')} />
                  {label}
                </Link>
              )
            })}
          </nav>

          {/* User + Sign Out */}
          <div className="flex-shrink-0 border-t border-slate-700/50 p-3">
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-700/50 transition-colors group">
              <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {user.full_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{user.full_name}</p>
                <p className="text-xs text-slate-500 capitalize">{user.role.replace('_', ' ')}</p>
              </div>
              <button
                onClick={signOut}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-600 text-slate-400 hover:text-white"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile: Hamburger Button ── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* ── Mobile: Full Overlay Sidebar ── */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="lg:hidden fixed left-0 top-0 h-screen w-72 bg-slate-900 z-50 shadow-2xl flex flex-col">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Logo */}
            <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700/50">
              <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <Wrench className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">FixOps</p>
                <p className="text-slate-500 text-xs">Maintenance System</p>
              </div>
            </div>

            {/* Collapsible Groups */}
            <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
              {visibleGroups.map((group) => (
                <div key={group.label} className="mb-2">
                  <button
                    onClick={() => setMobileCollapsed(prev => ({ ...prev, [group.label]: !prev[group.label] }))}
                    className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-400 transition-colors"
                  >
                    {group.label}
                    <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', mobileCollapsed[group.label] && '-rotate-90')} />
                  </button>
                  {!mobileCollapsed[group.label] && (
                    <div className="mt-1 space-y-0.5">
                      {group.items
                        .filter(({ excludeRoles, onlyRoles }) =>
                          !excludeRoles?.includes(user.role) && (!onlyRoles || onlyRoles.includes(user.role))
                        )
                        .map(({ href, label, icon: Icon, exact }) => {
                          const active = exact ? pathname === href : (pathname === href || pathname.startsWith(href + '/'))
                          return (
                            <Link
                              key={href}
                              href={href}
                              onClick={() => setMobileOpen(false)}
                              className={cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                                active
                                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/30'
                                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                              )}
                            >
                              <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-white' : 'text-slate-500 group-hover:text-slate-300')} />
                              {label}
                            </Link>
                          )
                        })}
                    </div>
                  )}
                </div>
              ))}
            </nav>

            {/* User */}
            <div className="border-t border-slate-700/50 p-3">
              <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-700/50 transition-colors group">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {user.full_name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user.full_name}</p>
                  <p className="text-xs text-slate-500 capitalize">{user.role.replace('_', ' ')}</p>
                </div>
                <button
                  onClick={signOut}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-600"
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
