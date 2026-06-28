'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Trash2, Loader2, AlertCircle, ChevronDown, X, Banknote } from 'lucide-react'

interface Customer { id: string; full_name: string; customer_code: string; mobile_number?: string }
interface Entry {
  id: string; invoice_ref: string; invoice_date: string; due_date: string | null
  amount: number; balance_due: number; notes: string | null
  customers: { full_name: string; customer_code: string } | null
}

interface Props { customers: Customer[]; entries: Entry[] }

const inputCls = 'border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full'
const today = new Date().toISOString().split('T')[0]

function CustomerCombobox({ customers, value, onChange }: { customers: Customer[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const selected = customers.find(c => c.id === value)

  const filtered = search.trim()
    ? customers.filter(c =>
        c.full_name.toLowerCase().includes(search.toLowerCase()) ||
        c.customer_code.toLowerCase().includes(search.toLowerCase()) ||
        (c.mobile_number ?? '').includes(search)
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
    onChange(id)
    setOpen(false)
    setSearch('')
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
      >
        {selected ? (
          <span className="text-slate-900 truncate">{selected.full_name} <span className="text-slate-400 text-xs">({selected.customer_code})</span></span>
        ) : (
          <span className="text-slate-400">Select customer…</span>
        )}
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); select('') }}
              onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), select(''))}
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
              placeholder="Search name, code, phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm text-slate-900 placeholder-slate-400 bg-white px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-400 px-3 py-3 text-center">No customers found</p>
            ) : filtered.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => select(c.id)}
                className={`w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 transition flex items-center justify-between gap-2 ${value === c.id ? 'bg-blue-50 font-semibold' : ''}`}
              >
                <span className="text-slate-900">{c.full_name}</span>
                <span className="text-xs text-slate-400 flex-shrink-0">{c.customer_code}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function OpeningReceivablesForm({ customers, entries: initialEntries }: Props) {
  const router = useRouter()
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  // Payment recording state
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payError, setPayError] = useState('')
  const [payingSaving, setPayingSaving] = useState(false)

  function openPayment(entry: Entry) {
    setPayingId(entry.id)
    setPayAmount(entry.balance_due.toFixed(3))
    setPayError('')
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(payAmount)
    if (!amount || amount <= 0) { setPayError('Enter a valid amount'); return }
    setPayingSaving(true)
    setPayError('')
    try {
      const res = await fetch('/api/opening-receivables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: payingId, payment_amount: amount }),
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
    customer_id: '',
    invoice_ref: '',
    invoice_date: today,
    due_date: '',
    amount: '',
    notes: '',
  })

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.customer_id || !form.invoice_ref || !form.amount) { setError('Customer, Invoice Ref and Amount are required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/opening-receivables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const customer = customers.find(c => c.id === form.customer_id)
      setEntries(prev => [...prev, { ...data, customers: customer ? { full_name: customer.full_name, customer_code: customer.customer_code } : null }])
      setForm({ customer_id: '', invoice_ref: '', invoice_date: today, due_date: '', amount: '', notes: '' })
      setShowForm(false)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this opening receivable?')) return
    setDeleting(id)
    try {
      const res = await fetch('/api/opening-receivables', {
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

  const total = entries.reduce((s, e) => s + e.balance_due, 0)

  return (
    <div className="space-y-5">
      {/* Summary */}
      {entries.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-800">{entries.length} opening receivables</p>
            <p className="text-xs text-amber-600 mt-0.5">These appear in Receivables and Bill-wise Outstanding</p>
          </div>
          <p className="text-xl font-bold text-amber-700">{formatCurrency(total)}</p>
        </div>
      )}

      {/* Table */}
      {entries.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Customer</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Invoice Ref</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Date</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Due Date</th>
                  <th className="text-right text-xs font-semibold text-red-600 uppercase tracking-wider px-5 py-3">Balance Due</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map(e => (
                  <React.Fragment key={e.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-sm font-semibold text-slate-800">{e.customers?.full_name ?? '—'}</p>
                        <p className="text-xs text-slate-400">{e.customers?.customer_code}</p>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-700">{e.invoice_ref}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{formatDate(e.invoice_date)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{e.due_date ? formatDate(e.due_date) : '—'}</td>
                      <td className="px-5 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(e.balance_due)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => payingId === e.id ? setPayingId(null) : openPayment(e)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition ${payingId === e.id ? 'bg-slate-100 text-slate-600' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
                          >
                            <Banknote className="w-3.5 h-3.5" />
                            {payingId === e.id ? 'Cancel' : 'Receive'}
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
                              <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Amount (KWD)</label>
                              <input
                                type="number"
                                min="0.001"
                                max={e.balance_due}
                                step="0.001"
                                value={payAmount}
                                onChange={ev => setPayAmount(ev.target.value)}
                                className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                                autoFocus
                              />
                            </div>
                            {payError && (
                              <p className="text-xs text-red-600 self-center">{payError}</p>
                            )}
                            <button
                              type="submit"
                              disabled={payingSaving}
                              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-60 transition"
                            >
                              {payingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                              Confirm Payment
                            </button>
                            <p className="text-xs text-slate-500 self-center">Balance due: {formatCurrency(e.balance_due)}</p>
                          </form>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td colSpan={4} className="px-5 py-3 text-sm font-bold text-slate-700">Total</td>
                  <td className="px-5 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h3 className="font-semibold text-slate-900 text-sm">Add Opening Receivable</h3>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Customer *</label>
              <CustomerCombobox
                customers={customers}
                value={form.customer_id}
                onChange={id => setForm(f => ({ ...f, customer_id: id }))}
              />
              {!form.customer_id && saving && <p className="text-xs text-red-500 mt-1">Customer is required</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Invoice / Bill Ref *</label>
              <input value={form.invoice_ref} onChange={set('invoice_ref')} placeholder="e.g. INV-2024-001" required className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Invoice Date *</label>
              <input type="date" value={form.invoice_date} onChange={set('invoice_date')} required className={inputCls} />
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
          <Plus className="w-4 h-4" /> Add Opening Receivable
        </button>
      )}
    </div>
  )
}
