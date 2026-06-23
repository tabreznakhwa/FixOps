'use client'

import { Bell, Search } from 'lucide-react'

interface HeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="lg:block">
          <h1 className="text-xl font-bold text-slate-900 leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-3">
          <button className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 text-slate-500 text-sm hover:bg-slate-200 transition-colors">
            <Search className="w-4 h-4" />
            <span>Search...</span>
            <kbd className="ml-2 text-xs bg-slate-200 px-1.5 py-0.5 rounded">⌘K</kbd>
          </button>

          <button className="relative w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
    </header>
  )
}
