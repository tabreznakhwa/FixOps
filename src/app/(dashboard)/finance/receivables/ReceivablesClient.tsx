'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, ChevronDown, ChevronRight, Printer, Search, X } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DocumentLink } from '@/components/ui/DocumentLink'
import { useCurrentPath } from '@/lib/backNav.client'
import { withReturnTo } from '@/lib/backNav'
import {
  sortReceivableRows,
  type ReceivableDirection,
  type ReceivableRow,
  type ReceivableSort,
} from './receivablesSort'

const MAX_BATCH_PRINT = 100

interface Customer {
  customer_id: string
  full_name: string
  mobile_number: string
  area: string | null
  total_balance: number
  invoices: ReceivableRow[]
}

export function ReceivablesClient({
  customers,
  sort,
  direction,
}: {
  customers: Customer[]
  sort: ReceivableSort
  direction: ReceivableDirection
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const receivablesPath = useCurrentPath()
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pendingSort, setPendingSort] = useState<{
    sort: ReceivableSort
    direction: ReceivableDirection
  } | null>(null)
  const previousServerSort = useRef({ sort, direction })
  useEffect(() => {
    const previous = previousServerSort.current
    previousServerSort.current = { sort, direction }
    if (previous.sort !== sort || previous.direction !== direction) {
      queueMicrotask(() => setPendingSort(null))
    }
  }, [sort, direction])
  const activeSort = pendingSort?.sort ?? sort
  const activeDirection = pendingSort?.direction ?? direction

  const sortedCustomers = customers.map(customer => ({
    ...customer,
    invoices: sortReceivableRows(customer.invoices, activeSort, activeDirection),
  }))
  const filtered = search.trim()
    ? sortedCustomers.filter(c =>
        c.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (c.mobile_number ?? '').includes(search) ||
        (c.area ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : sortedCustomers

  const maxBalance = customers[0]?.total_balance ?? 1

  const updateSort = (next: {
    sort?: ReceivableSort
    direction?: ReceivableDirection
  }) => {
    const currentState = pendingSort ?? previousServerSort.current
    const nextState = {
      sort: next.sort ?? currentState.sort,
      direction: next.direction ?? currentState.direction,
    }
    setPendingSort(nextState)

    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', nextState.sort)
    params.set('dir', nextState.direction)
    const query = params.toString()
    router.push(`${pathname}${query ? `?${query}` : ''}`, { scroll: false })
  }

  const toggleInvoice = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < MAX_BATCH_PRINT) {
        next.add(id)
      }
      return next
    })
  }

  const toggleAllForCustomer = (invoiceIds: string[]) => {
    const allSelected = invoiceIds.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) {
        invoiceIds.forEach(id => next.delete(id))
      } else {
        for (const id of invoiceIds) {
          if (next.size >= MAX_BATCH_PRINT) break
          next.add(id)
        }
      }
      return next
    })
  }

  const printSelected = () => {
    router.push(withReturnTo(
      `/finance/invoices/print-batch?ids=${Array.from(selected).join(',')}`,
      receivablesPath,
    ))
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-900 flex-shrink-0">Customer Balances</h3>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            Sort by
            <select
              value={activeSort}
              onChange={event => updateSort({ sort: event.target.value as ReceivableSort })}
              aria-label="Sort receivables by"
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="date">Invoice date</option>
              <option value="amount">Amount</option>
              <option value="invoice">Invoice / reference</option>
            </select>
          </label>
          <label className="sr-only" htmlFor="receivables-sort-direction">Sort direction</label>
          <select
            id="receivables-sort-direction"
            value={activeDirection}
            onChange={event => updateSort({ direction: event.target.value as ReceivableDirection })}
            aria-label="Receivables sort direction"
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
        <div className="relative flex items-center flex-1 min-w-[12rem] max-w-xs">
          <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, area…"
            className="w-full pl-9 pr-8 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 p-0.5 text-slate-400 hover:text-slate-600" aria-label="Clear customer search">
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
                {isOpen && (() => {
                  const selectableIds = c.invoices.flatMap(inv => (
                    inv.source === 'invoice' && inv.invoiceId ? [inv.invoiceId] : []
                  ))
                  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id))
                  return (
                  <div className="bg-slate-50 border-t border-slate-100 px-5 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Balance Invoices</p>
                      {selectableIds.length > 0 && (
                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 cursor-pointer" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={allSelected}
                            disabled={!allSelected && selected.size >= MAX_BATCH_PRINT}
                            onChange={() => toggleAllForCustomer(selectableIds)}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                          />
                          Select all
                        </label>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {c.invoices.map(inv => (
                        <div key={inv.rowKey} className="flex items-center justify-between bg-white rounded-lg px-3 py-2.5 border border-slate-100">
                          <div className="flex items-center gap-3">
                            {inv.source === 'invoice' && inv.invoiceId && (
                              <input
                                type="checkbox"
                                checked={selected.has(inv.invoiceId)}
                                disabled={!selected.has(inv.invoiceId) && selected.size >= MAX_BATCH_PRINT}
                                onChange={() => toggleInvoice(inv.invoiceId!)}
                                onClick={e => e.stopPropagation()}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 flex-shrink-0 disabled:opacity-40"
                              />
                            )}
                            {inv.source === 'invoice' && inv.invoiceId ? (
                              <DocumentLink href={withReturnTo(`/finance/invoices/${inv.invoiceId}`, receivablesPath)}
                                tabLabel={inv.invoice_number}
                                className="text-xs font-mono font-semibold text-blue-600 hover:underline"
                                onClick={e => e.stopPropagation()}>
                                {inv.invoice_number}
                              </DocumentLink>
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
                            <p className="text-[10px] text-slate-400">Invoice {formatDate(inv.invoice_date)}</p>
                            {inv.due_date && (
                              <p className="text-[10px] text-slate-400">Due {formatDate(inv.due_date)}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky bottom-0 left-0 right-0 bg-slate-900 text-white px-5 py-3 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-sm font-medium">{selected.size} invoice{selected.size === 1 ? '' : 's'} selected</span>
            {selected.size === MAX_BATCH_PRINT && (
              <p className="text-[11px] text-slate-300">Maximum {MAX_BATCH_PRINT} invoices per print batch</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Clear
            </button>
            <button
              onClick={printSelected}
              className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Printer className="w-4 h-4" /> Print / Save PDF
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
