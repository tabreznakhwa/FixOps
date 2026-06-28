'use client'

import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { Search, ChevronDown, X } from 'lucide-react'

interface Supplier { id: string; supplier_name: string; supplier_code: string }

interface Props {
  suppliers: Supplier[]
  selectedId: string
  fromDate: string
  toDate: string
}

export function SupplierSelector({ suppliers, selectedId, fromDate, toDate }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = suppliers.find(s => s.id === selectedId) ?? null
  const filtered = query.trim()
    ? suppliers.filter(s =>
        s.supplier_name.toLowerCase().includes(query.toLowerCase()) ||
        s.supplier_code.toLowerCase().includes(query.toLowerCase())
      )
    : suppliers

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function navigate(supplierId: string) {
    const p = new URLSearchParams()
    if (supplierId) p.set('supplier_id', supplierId)
    if (fromDate) p.set('from_date', fromDate)
    if (toDate) p.set('to_date', toDate)
    router.push(`/suppliers/vendor-ledger${p.toString() ? '?' + p.toString() : ''}`)
    setOpen(false)
    setQuery('')
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="font-semibold text-slate-900 mb-4">Select Supplier</h2>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]" ref={ref}>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Supplier</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50) }}
              className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {selected
                ? <span className="text-slate-900 truncate">{selected.supplier_name} <span className="text-slate-400 text-xs">({selected.supplier_code})</span></span>
                : <span className="text-slate-400">Select supplier…</span>}
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                {selected && (
                  <span role="button" onClick={e => { e.stopPropagation(); navigate('') }}
                    className="p-0.5 text-slate-400 hover:text-red-400 rounded cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </span>
                )}
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </div>
            </button>
            {open && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                <div className="p-2 border-b border-slate-100">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input ref={inputRef} autoFocus type="text" placeholder="Search supplier…"
                      value={query} onChange={e => setQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {filtered.length === 0
                    ? <p className="text-sm text-slate-400 px-3 py-3 text-center">No suppliers found</p>
                    : filtered.map(s => (
                        <button key={s.id} type="button" onClick={() => navigate(s.id)}
                          className={`w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 transition flex items-center justify-between gap-2 ${selectedId === s.id ? 'bg-blue-50 font-semibold' : ''}`}>
                          <span className="text-slate-900 truncate">{s.supplier_name}</span>
                          <span className="text-xs text-slate-400 flex-shrink-0">{s.supplier_code}</span>
                        </button>
                      ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">From</label>
          <input type="date" defaultValue={fromDate}
            onChange={e => {
              const p = new URLSearchParams()
              if (selectedId) p.set('supplier_id', selectedId)
              if (e.target.value) p.set('from_date', e.target.value)
              if (toDate) p.set('to_date', toDate)
              router.push(`/suppliers/vendor-ledger?${p.toString()}`)
            }}
            className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">To</label>
          <input type="date" defaultValue={toDate || today}
            onChange={e => {
              const p = new URLSearchParams()
              if (selectedId) p.set('supplier_id', selectedId)
              if (fromDate) p.set('from_date', fromDate)
              if (e.target.value) p.set('to_date', e.target.value)
              router.push(`/suppliers/vendor-ledger?${p.toString()}`)
            }}
            className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
    </div>
  )
}
