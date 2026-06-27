'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, X } from 'lucide-react'

interface Customer {
  id: string
  full_name: string
  mobile_number: string
  company_name: string | null
}

interface Props {
  customers: Customer[]
  selectedId: string
}

export function LedgerCustomerSelector({ customers, selectedId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const selected = customers.find((c) => c.id === selectedId) ?? null

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

  const select = (id: string) => {
    setOpen(false)
    setSearch('')
    if (id) router.push(`?customer_id=${id}`)
    else router.push('?')
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 print:hidden">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Select Customer</label>
          <div ref={ref} className="relative">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            >
              {selected ? (
                <span className="text-slate-900 truncate">
                  {selected.full_name}
                  {selected.company_name ? (
                    <span className="text-slate-500"> — {selected.company_name}</span>
                  ) : null}
                  {selected.mobile_number ? (
                    <span className="text-slate-400"> · {selected.mobile_number}</span>
                  ) : null}
                </span>
              ) : (
                <span className="text-slate-400">Choose a customer…</span>
              )}
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                {selected && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); select('') }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), select(''))}
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
                        onClick={() => select(c.id)}
                        className={`w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 transition flex items-center justify-between gap-2 ${selectedId === c.id ? 'bg-blue-50 font-semibold' : ''}`}
                      >
                        <span className="text-slate-900 truncate">
                          {c.full_name}
                          {c.company_name ? (
                            <span className="text-slate-400 font-normal"> — {c.company_name}</span>
                          ) : null}
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
      </div>
    </div>
  )
}
