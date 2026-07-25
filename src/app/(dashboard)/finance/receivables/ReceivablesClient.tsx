'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'

interface Invoice {
  id: string
  invoice_number: string
  balance_due: number
  due_date: string | null
  status: string
  invoice_date: string
}

interface Customer {
  customer_id: string
  full_name: string
  mobile_number: string
  area: string | null
  total_balance: number
  invoices: Invoice[]
}

export function ReceivablesClient({ customers }: { customers: Customer[] }) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = search.trim()
    ? customers.filter(c =>
        c.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (c.mobile_number ?? '').includes(search) ||
        (c.area ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : customers

  const maxBalance = customers[0]?.total_balance ?? 1

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-900 flex-shrink-0">Customer Balances</h3>
        <div className="relative flex items-center flex-1 max-w-xs">
          <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, area…"
            className="w-full pl-9 pr-8 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 p-0.5 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <span className="text-sm text-slate-500 flex-shrink-0">{filtered.length} customers</span>
      </div>

      {filtered.length === 0 ? (
        <div className="p-10 text-center text-slate-400 text-sm">No customers match your search</div>
      ) : (
        <div className="divide-y divide-slate-50">
          {filtered.map((c, idx) => {
            const overdueCount = c.invoices.filter(i => i.status === 'overdue').length
            const barWidth = (c.total_balance / maxBalance) * 100
            const isOpen = expanded === c.customer_id

            return (
              <div key={c.customer_id}>
                {/* Customer row — click to expand */}
                <div
                  className="px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer select-none"
                  onClick={() => setExpanded(isOpen ? null : c.customer_id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-400 w-5">#{idx + 1}</span>
                      <div className="flex items-center gap-2">
                        {isOpen
                          ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{c.full_name}</p>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <span>📱 {c.mobile_number}</span>
                            {c.area && <span>📍 {c.area}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-amber-600">{formatCurrency(c.total_balance)}</p>
                      <div className="flex items-center gap-2 justify-end mt-0.5">
                        <span className="text-xs text-slate-500">{c.invoices.length} inv.</span>
                        {overdueCount > 0 && (
                          <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                            <AlertTriangle className="w-3 h-3" /> {overdueCount} overdue
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${barWidth}%` }} />
                  </div>
                </div>

                {/* Expandable invoice list */}
                {isOpen && (
                  <div className="bg-slate-50 border-t border-slate-100 px-5 py-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Balance Invoices</p>
                    <div className="space-y-1.5">
                      {c.invoices.map((inv, i) => (
                        <div key={inv.id ?? i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2.5 border border-slate-100">
                          <div className="flex items-center gap-3">
                            {inv.id ? (
                              <Link href={`/finance/invoices/${inv.id}?return_to=/finance/receivables`}
                                className="text-xs font-mono font-semibold text-blue-600 hover:underline"
                                onClick={e => e.stopPropagation()}>
                                {inv.invoice_number}
                              </Link>
                            ) : (
                              <span className="text-xs font-mono text-slate-500">{inv.invoice_number}</span>
                            )}
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              inv.status === 'overdue' ? 'bg-red-100 text-red-700'
                              : inv.status === 'partial' ? 'bg-amber-100 text-amber-700'
                              : inv.status === 'opening' ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                            }`}>
                              {inv.status === 'opening' ? 'Opening' : inv.status}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-amber-600">{formatCurrency(inv.balance_due)}</p>
                            {inv.due_date && (
                              <p className="text-[10px] text-slate-400">Due {formatDate(inv.due_date)}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
