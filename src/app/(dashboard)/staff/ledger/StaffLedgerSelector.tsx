'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, X, Search } from 'lucide-react'

interface StaffItem {
  id: string
  full_name: string
  staff_code: string
  designation: string | null
  department: string | null
  employment_status: string
}

interface Props {
  staffList: StaffItem[]
  selectedId: string
  fromDate: string
  toDate: string
}

const inputCls =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition'

export function StaffLedgerSelector({ staffList, selectedId, fromDate, toDate }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [localFrom, setLocalFrom] = useState(fromDate)
  const [localTo, setLocalTo] = useState(toDate)
  const [localStaffId, setLocalStaffId] = useState(selectedId)
  const ref = useRef<HTMLDivElement>(null)

  const selected = staffList.find((s) => s.id === localStaffId) ?? null

  const filtered = search.trim()
    ? staffList.filter(
        (s) =>
          s.full_name.toLowerCase().includes(search.toLowerCase()) ||
          s.staff_code.toLowerCase().includes(search.toLowerCase()) ||
          (s.designation ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : staffList

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectStaff = (id: string) => {
    setLocalStaffId(id)
    setOpen(false)
    setSearch('')
  }

  const applyFilters = (from = localFrom, to = localTo, staffId = localStaffId) => {
    const params = new URLSearchParams()
    if (staffId) params.set('staff_id', staffId)
    if (from) params.set('from_date', from)
    if (to) params.set('to_date', to)
    router.push(`?${params.toString()}`)
  }

  const clearStaff = () => {
    setLocalStaffId('')
    router.push('?')
  }

  function applyPreset(preset: string) {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    let from = '', to = ''
    if (preset === 'month') {
      from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
      to = fmt(now)
    } else if (preset === 'year') {
      from = `${now.getFullYear()}-01-01`
      to = fmt(now)
    }
    setLocalFrom(from)
    setLocalTo(to)
    applyFilters(from, to)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 print:hidden space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_180px_auto] gap-3 items-end">
        {/* Staff combobox */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Employee</label>
          <div ref={ref} className="relative">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            >
              {selected ? (
                <span className="text-slate-900 truncate">
                  {selected.full_name}
                  {selected.employment_status !== 'active' && (
                    <span className="text-slate-400 font-normal"> (Former)</span>
                  )}
                  {selected.designation && (
                    <span className="text-slate-500"> — {selected.designation}</span>
                  )}
                </span>
              ) : (
                <span className="text-slate-400">Choose an employee…</span>
              )}
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                {selected && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); clearStaff() }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), clearStaff())}
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
                    placeholder="Search name, code, role…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full text-sm text-slate-900 placeholder-slate-400 bg-white px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-slate-400 px-3 py-3 text-center">No employees found</p>
                  ) : (
                    filtered.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => selectStaff(s.id)}
                        className={`w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 transition flex items-center justify-between gap-2 ${localStaffId === s.id ? 'bg-blue-50' : ''}`}
                      >
                        <span className="text-slate-900 truncate font-medium">
                          {s.full_name}
                          {s.employment_status !== 'active' && (
                            <span className="text-slate-400 font-normal"> (Former)</span>
                          )}
                          {s.designation && (
                            <span className="text-slate-500 font-normal"> — {s.designation}</span>
                          )}
                        </span>
                        <span className="text-xs text-slate-400 flex-shrink-0 font-mono">{s.staff_code}</span>
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

        {/* Apply */}
        <button
          type="button"
          onClick={() => applyFilters()}
          disabled={!localStaffId}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Search className="w-4 h-4" />
          View
        </button>
      </div>

      {/* Quick presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400 font-medium">Quick:</span>
        {[
          { label: 'This Month', key: 'month' },
          { label: 'This Year', key: 'year' },
          { label: 'All Time', key: 'all' },
        ].map(({ label, key }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (key === 'all') { setLocalFrom(''); setLocalTo(''); applyFilters('', '') }
              else applyPreset(key)
            }}
            className="px-3 py-1 text-xs font-semibold rounded-full border border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Active filter chips */}
      {(fromDate || toDate) && selectedId && (
        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
          <span>Showing:</span>
          {fromDate && <span className="bg-slate-100 px-2 py-0.5 rounded-full">From {fromDate}</span>}
          {toDate && <span className="bg-slate-100 px-2 py-0.5 rounded-full">To {toDate}</span>}
          <button
            onClick={() => { setLocalFrom(''); setLocalTo(''); router.push(`?staff_id=${selectedId}`) }}
            className="text-blue-500 hover:text-blue-700 underline"
          >
            Clear dates
          </button>
        </div>
      )}
    </div>
  )
}
