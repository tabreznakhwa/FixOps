'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Trash2, Loader2, AlertCircle, Search, ChevronDown, X, Banknote } from 'lucide-react'

interface Supplier { id: string; supplier_name: string; supplier_code: string }
interface Entry {
  id: string; supplier_id: string; bill_ref: string; bill_date: string; due_date: string | null
  amount: number; balance_due: number; notes: string | null
  suppliers: { supplier_name: string; supplier_code: string } | null
}

interface Props { suppliers: Supplier[]; entries: Entry[] }

const inputCls = 'border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full'
const today = new Date().toISOString().split('T')[0]

// ── Searchable supplier dropdown ───────────────────────────────────────────────

function SupplierSelect({
  suppliers,
  value,
  onChange,
}: {
  suppliers: Supplier[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = suppliers.find(s => s.id === value) ?? null

  const filtered = query.trim()
    ? suppliers.filter(s =>
        s.supplier_name.toLowerCase().includes(query.toLowerCase()) ||
        s.supplier_code.toLowerCase().includes(query.toLowerCase())
      )
    : suppliers

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleOpen() {
    setOpen(true)
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleSelect(s: Supplier) {
    onChange(s.id)
    setOpen(false)
    setQuery('')
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('')
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className={`${inputCls} flex items-center justify-between gap-2 text-left`}
        style={{ paddingRight: '0.5rem' }}
      >
        {selected ? (
          <span className="flex-1 truncate">
            <span className="font-medium">{selected.supplier_name}</span>
            <span className="ml-2 text-slate-400 text-xs">{selected.supplier_code}</span>
          </span>
        ) : (
          <span className="text-slate-400 flex-1">Select supplier…</span>
        )}
        <span className="flex items-center gap-0.5 flex-shrink-0">
          {selected && (
            <span
              role="button"
              onClick={handleClear}
              className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search supplier…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Options list */}
          <ul className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-slate-400 text-center">No suppliers match &ldquo;{query}&rdquo;</li>
            ) : (
              filtered.map(s => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(s)}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between gap-3 ${s.id === value ? 'bg-blue-50 text-blue-700' : 'text-slate-800'}`}
                  >
                    <span className="font-medium truncate">{s.supplier_name}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0">{s.supplier_code}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────

export function OpeningPayablesForm({ suppliers, entries: initialEntries }: Props) {
  const router = useRouter()
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  // Payment state
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState('cash')
  const [payDate, setPayDate] = useState(today)
  const [payError, setPayError] = useState('')
  const [payingSaving, setPayingSaving] = useState(false)

  function openPayment(entry: Entry) {
    setPayingId(entry.id)
    setPayAmount(entry.balance_due.toFixed(3))
    setPayMode('cash')
    setPayDate(today)
    setPayError('')
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(payAmount)
    if (!amount || amount <= 0) { setPayError('Enter a valid amount'); return }
    const entry = entries.find(e => e.id === payingId)
    if (!entry) return
    setPayingSaving(true)
    setPayError('')
    try {
      const res = await fetch('/api/opening-payables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: payingId,
          payment_amount: amount,
          payment_mode: payMode,
          payment_date: payDate,
          supplier_id: entry.supplier_id,
          bill_ref: entry.bill_ref,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEntries(prev => prev.map(e =>
        e.id === payingId ? { ...e, balance_due: data.balance_due } : e
      ).filter(e => e.balance_due > 0))
      setPayingId(null)
      router.refresh()
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setPayingSaving(false)
    }
  }

  const [form, setForm] = useState({
    supplier_id: '',
    bill_ref: '',
    bill_date: today,
    due_date: '',
    amount: '',
    notes: '',
  })

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.supplier_id || !form.bill_ref || !form.amount) { setError('Supplier, Bill Ref and Amount are required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/opening-payables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const supplier = suppliers.find(s => s.id === form.supplier_id)
      setEntries(prev => [...prev, { ...data, suppliers: supplier ? { supplier_name: supplier.supplier_name, supplier_code: supplier.supplier_code } : null }])
      setForm({ supplier_id: '', bill_ref: '', bill_date: today, due_date: '', amount: '', notes: '' })
      setShowForm(false)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this opening payable?')) return
    setDeleting(id)
    try {
      const res = await fetch('/api/opening-payables', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Delete failed')
      setEntries(prev => prev.filter(e => e.id !== id))
      router.refresh()
    } finally {
      setDeleting(null)
    }
  }

  const filtered = search.trim()
    ? entries.filter(e => {
        const q = search.toLowerCase()
        return (
          e.suppliers?.supplier_name.toLowerCase().includes(q) ||
          e.suppliers?.supplier_code.toLowerCase().includes(q) ||
          e.bill_ref.toLowerCase().includes(q)
        )
      })
    : entries

  const total = entries.reduce((s, e) => s + e.balance_due, 0)
  const filteredTotal = filtered.reduce((s, e) => s + e.balance_due, 0)

  return (
    <div className="space-y-5">
      {entries.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-red-800">{entries.length} opening payables</p>
            <p className="text-xs text-red-600 mt-0.5">These appear in Vendor Payments outstanding</p>
          </div>
          <p className="text-xl font-bold text-red-700">{formatCurrency(total)}</p>
        </div>
      )}

      {entries.length > 0 && (
        <>
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by supplier name, code, or bill ref…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Supplier</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Bill Ref</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Date</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Due Date</th>
                    <th className="text-right text-xs font-semibold text-red-600 uppercase tracking-wider px-5 py-3">Balance Due</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">
                        No entries match &ldquo;{search}&rdquo;
                      </td>
                    </tr>
                  ) : (
                    filtered.map(e => (
                      <React.Fragment key={e.id}>
                        <tr className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3">
                            <p className="text-sm font-semibold text-slate-800">{e.suppliers?.supplier_name ?? '—'}</p>
                            <p className="text-xs text-slate-400">{e.suppliers?.supplier_code}</p>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-slate-700">{e.bill_ref}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{formatDate(e.bill_date)}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{e.due_date ? formatDate(e.due_date) : '—'}</td>
                          <td className="px-5 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(e.balance_due)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => payingId === e.id ? setPayingId(null) : openPayment(e)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition ${payingId === e.id ? 'bg-slate-100 text-slate-600' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
                              >
                                <Banknote className="w-3.5 h-3.5" />
                                {payingId === e.id ? 'Cancel' : 'Pay'}
                              </button>
                              <button
                                onClick={() => handleDelete(e.id)}
                                disabled={deleting === e.id}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                              >
                                {deleting === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {payingId === e.id && (
                          <tr className="bg-green-50">
                            <td colSpan={6} className="px-5 py-4">
                              <form onSubmit={handlePayment} className="flex items-end gap-3 flex-wrap">
                                <div>
                                  <label className="block text-xs font-semibold text-slate-600 mb-1">Amount (KWD)</label>
                                  <input
                                    type="number" min="0.001" max={e.balance_due} step="0.001"
                                    value={payAmount} onChange={ev => setPayAmount(ev.target.value)}
                                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 w-36 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                                    autoFocus
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Mode</label>
                                  <select value={payMode} onChange={ev => setPayMode(ev.target.value)}
                                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                                    <option value="cash">Cash</option>
                                    <option value="bank_transfer">Bank Transfer</option>
                                    <option value="cheque">Cheque</option>
                                    <option value="knet">KNET</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
                                  <input type="date" value={payDate} onChange={ev => setPayDate(ev.target.value)}
                                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                                  />
                                </div>
                                {payError && <p className="text-xs text-red-600 self-center">{payError}</p>}
                                <button type="submit" disabled={payingSaving}
                                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-60 transition">
                                  {payingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                                  Confirm Payment
                                </button>
                                <p className="text-xs text-slate-500 self-center">Balance: {formatCurrency(e.balance_due)}</p>
                              </form>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={4} className="px-5 py-3 text-sm font-bold text-slate-700">
                      {search.trim() ? `${filtered.length} of ${entries.length} entries` : 'Total'}
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-red-600">
                      {formatCurrency(search.trim() ? filteredTotal : total)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {showForm ? (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h3 className="font-semibold text-slate-900 text-sm">Add Opening Payable</h3>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Supplier *</label>
              <SupplierSelect
                suppliers={suppliers}
                value={form.supplier_id}
                onChange={id => setForm(f => ({ ...f, supplier_id: id }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Bill / Invoice Ref *</label>
              <input value={form.bill_ref} onChange={set('bill_ref')} placeholder="e.g. SUP-INV-2024-001" required className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Bill Date *</label>
              <input type="date" value={form.bill_date} onChange={set('bill_date')} required className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Due Date</label>
              <input type="date" value={form.due_date} onChange={set('due_date')} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Balance Due (KWD) *</label>
              <input type="number" min="0.001" step="0.001" placeholder="0.000" value={form.amount} onChange={set('amount')} required className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Notes</label>
              <input value={form.notes} onChange={set('notes')} placeholder="Optional" className={inputCls} />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Entry'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError('') }}
              className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-slate-300 text-slate-600 text-sm font-semibold rounded-xl hover:border-blue-400 hover:text-blue-600 transition w-full justify-center">
          <Plus className="w-4 h-4" /> Add Opening Payable
        </button>
      )}
    </div>
  )
}
