'use client'

import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { Search, ChevronDown, X } from 'lucide-react'

interface Supplier { id: string; supplier_name: string; supplier_code: string }

export function SupplierFilter({ suppliers, selectedId }: { suppliers: Supplier[]; selectedId?: string }) {
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

  function navigate(id: string) {
    router.push(id ? `/suppliers/vendor-outstanding?supplier=${id}` : '/suppliers/vendor-outstanding')
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={ref} className="relative w-72 print:hidden">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50) }}
        className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {selected
          ? <span className="text-slate-900 truncate">{selected.supplier_name} <span className="text-slate-400 text-xs">({selected.supplier_code})</span></span>
          : <span className="text-slate-400">Filter by supplier…</span>}
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
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
  )
}
