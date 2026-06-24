'use client'

import { MessageSquare, AlertTriangle, CheckCircle2, TrendingUp, DollarSign, Package, Zap, Clock } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Stats {
  newComplaints: number
  openComplaints: number
  emergencyComplaints: number
  completedToday: number
  monthRevenue: number
  monthCollected: number
  totalReceivables: number
  lowStockCount: number
}

export function DashboardStats({ stats, hideFinancials = false }: { stats: Stats; hideFinancials?: boolean }) {
  const cards = [
    {
      label: 'New Complaints',
      value: stats.newComplaints,
      icon: MessageSquare,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      border: 'border-purple-100',
      badge: stats.newComplaints > 0 ? 'Needs attention' : null,
      badgeColor: 'bg-purple-100 text-purple-700',
    },
    {
      label: 'Emergency Jobs',
      value: stats.emergencyComplaints,
      icon: Zap,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-100',
      badge: stats.emergencyComplaints > 0 ? 'Urgent' : null,
      badgeColor: 'bg-red-100 text-red-700',
    },
    {
      label: 'Open Jobs',
      value: stats.openComplaints,
      icon: Clock,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
      badge: null,
      badgeColor: '',
    },
    {
      label: 'Completed Today',
      value: stats.completedToday,
      icon: CheckCircle2,
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-100',
      badge: null,
      badgeColor: '',
    },
    {
      label: 'Month Revenue',
      value: formatCurrency(stats.monthRevenue),
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
      badge: null,
      badgeColor: '',
      isText: true,
    },
    {
      label: 'Month Collected',
      value: formatCurrency(stats.monthCollected),
      icon: DollarSign,
      color: 'text-teal-600',
      bg: 'bg-teal-50',
      border: 'border-teal-100',
      badge: null,
      badgeColor: '',
      isText: true,
    },
    {
      label: 'Total Receivables',
      value: formatCurrency(stats.totalReceivables),
      icon: AlertTriangle,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-100',
      badge: stats.totalReceivables > 0 ? 'Outstanding' : null,
      badgeColor: 'bg-amber-100 text-amber-700',
      isText: true,
    },
    {
      label: 'Low Stock Items',
      value: stats.lowStockCount,
      icon: Package,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      border: 'border-orange-100',
      badge: stats.lowStockCount > 0 ? 'Reorder needed' : null,
      badgeColor: 'bg-orange-100 text-orange-700',
    },
  ]

  const visibleCards = hideFinancials
    ? cards.filter(c => !['Month Revenue', 'Month Collected', 'Total Receivables'].includes(c.label))
    : cards

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {visibleCards.map(({ label, value, icon: Icon, color, bg, border, badge, badgeColor, isText }) => (
        <div
          key={label}
          className={`bg-white rounded-xl border ${border} p-4 hover:shadow-md transition-all duration-200 animate-count`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            {badge && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>
                {badge}
              </span>
            )}
          </div>
          <p className={`font-bold ${isText ? 'text-lg' : 'text-3xl'} text-slate-900 leading-tight`}>
            {value}
          </p>
          <p className="text-xs text-slate-500 mt-1">{label}</p>
        </div>
      ))}
    </div>
  )
}
