'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Trash2, Loader2, AlertCircle, Search } from 'lucide-react'

interface Supplier { id: string; supplier_name: string; supplier_code: string }
interface Entry {
  id: string; bill_ref: string; bill_date: string; due_date: string | null
  amount: number; balance_due: number; notes: string | null
  suppliers: { supplier_name: string; supplier_code: string } | null
}

interface Props { suppliers: Supplier[]; entries: Entry[] }

const inputCls = 'border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full'
const today = new Date().toISOString().split('T')[0]

export function OpeningPayablesForm({ suppliers, entries: initialEntries }: Props) {
  const router = useRouter()
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({
    supplier_id: '',
    bill_ref: '',
    bill_date: today,
    due_date: '',
    amount: '',
    notes: '',
  })

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
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
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3">
                          <p className="text-sm font-semibold text-slate-800">{e.suppliers?.supplier_name ?? '—'}</p>
                          <p className="text-xs text-slate-400">{e.suppliers?.supplier_code}</p>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-slate-700">{e.bill_ref}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{formatDate(e.bill_date)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{e.due_date ? formatDate(e.due_date) : '—'}</td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(e.balance_due)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDelete(e.id)}
                            disabled={deleting === e.id}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                          >
                            {deleting === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
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
              <select value={form.supplier_id} onChange={set('supplier_id')} required className={inputCls}>
                <option value="">Select supplier…</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name} ({s.supplier_code})</option>)}
              </select>
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
