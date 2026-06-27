'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, X, Search } from 'lucide-react'

interface Customer {
  id: string
  full_name: string
  mobile_number: string
  company_name: string | null
}

interface Props {
  customers: Customer[]
  selectedId: string
  fromDate: string
  toDate: string
}

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition'

export function LedgerCustomerSelector({ customers, selectedId, fromDate, toDate }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [localFrom, setLocalFrom] = useState(fromDate)
  const [localTo, setLocalTo] = useState(toDate)
  const [localCustomerId, setLocalCustomerId] = useState(selectedId)
  const ref = useRef<HTMLDivElement>(null)

  const selected = customers.find((c) => c.id === localCustomerId) ?? null

  const filtered = search.trim()
    ? customers.filter(
        (c) =>
          c.full_name.toLowerCase().includes(search.toLowerCase()) ||
          (c.company_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (c.mobile_number ?? '').includes(search),
      )
    : customers

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectCustomer = (id: string) => {
    setLocalCustomerId(id)
    setOpen(false)
    setSearch('')
  }

  const applyFilters = () => {
    const params = new URLSearchParams()
    if (localCustomerId) params.set('customer_id', localCustomerId)
    if (localFrom) params.set('from_date', localFrom)
    if (localTo) params.set('to_date', localTo)
    router.push(`?${params.toString()}`)
  }

  const clearCustomer = () => {
    setLocalCustomerId('')
    router.push('?')
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 print:hidden space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_180px_auto] gap-3 items-end">

        {/* Customer combobox */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Customer</label>
          <div ref={ref} className="relative">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            >
              {selected ? (
                <span className="text-slate-900 truncate">
                  {selected.full_name}
                  {selected.company_name ? <span className="text-slate-500"> — {selected.company_name}</span> : null}
                  {selected.mobile_number ? <span className="text-slate-400"> · {selected.mobile_number}</span> : null}
                </span>
              ) : (
                <span className="text-slate-400">Choose a customer…</span>
              )}
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                {selected && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); clearCustomer() }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), clearCustomer())}
                    className="p-0.5 text-slate-400 hover:text-red-400 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </span>
                )}
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </div>
            </button>

            {open && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                <div className="p-2 border-b border-slate-100">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search name, company, phone…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full text-sm text-slate-900 placeholder-slate-400 bg-white px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-slate-400 px-3 py-3 text-center">No customers found</p>
                  ) : (
                    filtered.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectCustomer(c.id)}
                        className={`w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 transition flex items-center justify-between gap-2 ${localCustomerId === c.id ? 'bg-blue-50 font-semibold' : ''}`}
                      >
                        <span className="text-slate-900 truncate">
                          {c.full_name}
                          {c.company_name ? <span className="text-slate-400 font-normal"> — {c.company_name}</span> : null}
                        </span>
                        {c.mobile_number && (
                          <span className="text-xs text-slate-400 flex-shrink-0">{c.mobile_number}</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* From date */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">From Date</label>
          <input
            type="date"
            value={localFrom}
            onChange={(e) => setLocalFrom(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* To date */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">To Date</label>
          <input
            type="date"
            value={localTo}
            onChange={(e) => setLocalTo(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Apply button */}
        <button
          type="button"
          onClick={applyFilters}
          disabled={!localCustomerId}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Search className="w-4 h-4" />
          View
        </button>
      </div>

      {/* Active filter chips */}
      {(fromDate || toDate) && selectedId && (
        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
          <span>Showing:</span>
          {fromDate && <span className="bg-slate-100 px-2 py-0.5 rounded-full">From {fromDate}</span>}
          {toDate && <span className="bg-slate-100 px-2 py-0.5 rounded-full">To {toDate}</span>}
          <button
            onClick={() => { setLocalFrom(''); setLocalTo(''); router.push(`?customer_id=${selectedId}`) }}
            className="text-blue-500 hover:text-blue-700 underline"
          >
            Clear dates
          </button>
        </div>
      )}
    </div>
  )
}
