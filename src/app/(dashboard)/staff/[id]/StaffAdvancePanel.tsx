'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Minus, X } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Advance {
  id: string
  type: string
  amount: number
  issued_date: string
  payment_method: string | null
  notes: string | null
}

interface Repayment {
  id: string
  amount: number
  repayment_date: string
  payment_method: string | null
  notes: string | null
}

interface Props {
  staffId: string
  currentBalance: number
  advances: Advance[]
  repayments: Repayment[]
}

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1'

function todayKuwait() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })
}

export function StaffAdvancePanel({ staffId, currentBalance, advances, repayments }: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState<'advance' | 'repayment' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    type: 'advance',
    amount: '',
    issued_date: todayKuwait(),
    payment_method: 'cash',
    notes: '',
  })
  const [repayForm, setRepayForm] = useState({
    amount: '',
    repayment_date: todayKuwait(),
    payment_method: 'cash',
    notes: '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }
  function setRepay(field: string, value: string) {
    setRepayForm(f => ({ ...f, [field]: value }))
  }

  function closeForms() {
    setShowForm(null)
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount || Number(form.amount) <= 0) { setError('Enter a valid amount'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/staff/${staffId}/advances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowForm(null)
      setForm({ type: 'advance', amount: '', issued_date: todayKuwait(), payment_method: 'cash', notes: '' })
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record advance')
    } finally {
      setLoading(false)
    }
  }

  async function handleRepaySubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!repayForm.amount || Number(repayForm.amount) <= 0) { setError('Enter a valid amount'); return }
    if (Number(repayForm.amount) > currentBalance) { setError(`Cannot exceed outstanding balance of ${formatCurrency(currentBalance)}`); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/staff/${staffId}/advances/repay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...repayForm, amount: Number(repayForm.amount) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowForm(null)
      setRepayForm({ amount: '', repayment_date: todayKuwait(), payment_method: 'cash', notes: '' })
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record repayment')
    } finally {
      setLoading(false)
    }
  }

  // Merge issuances (debit) and repayments (credit) into one chronological history
  type HistoryRow =
    | { kind: 'advance'; id: string; date: string; a: Advance }
    | { kind: 'repayment'; id: string; date: string; r: Repayment }

  const history: HistoryRow[] = [
    ...advances.map((a): HistoryRow => ({ kind: 'advance', id: a.id, date: a.issued_date, a })),
    ...repayments.map((r): HistoryRow => ({ kind: 'repayment', id: r.id, date: r.repayment_date, r })),
  ].sort((x, y) => y.date.localeCompare(x.date))

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Advances & Loans</h3>
          {currentBalance > 0 && (
            <p className="text-xs text-amber-600 font-semibold mt-0.5">
              Outstanding balance: {formatCurrency(currentBalance)}
            </p>
          )}
        </div>
        {!showForm && (
          <div className="flex items-center gap-2">
            {currentBalance > 0 && (
              <button
                onClick={() => setShowForm('repayment')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors"
              >
                <Minus className="w-3.5 h-3.5" /> Record Repayment
              </button>
            )}
            <button
              onClick={() => setShowForm('advance')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Record
            </button>
          </div>
        )}
      </div>

      {showForm === 'advance' && (
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">New Advance / Loan</p>
            <button onClick={closeForms} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} className={inputClass}>
                <option value="advance">Salary Advance</option>
                <option value="loan">Loan</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Amount (KWD)</label>
              <input type="number" min="0.001" step="0.001" placeholder="0.000"
                value={form.amount} onChange={e => set('amount', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Date</label>
              <input type="date" value={form.issued_date} onChange={e => set('issued_date', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Payment Method</label>
              <select value={form.payment_method} onChange={e => set('payment_method', e.target.value)} className={inputClass}>
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Notes (optional)</label>
              <input type="text" placeholder="e.g. Emergency advance" value={form.notes} onChange={e => set('notes', e.target.value)} className={inputClass} />
            </div>
            <div className="col-span-2 flex justify-end gap-2 pt-1">
              <button type="button" onClick={closeForms}
                className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 transition">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
                {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : 'Record Advance'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showForm === 'repayment' && (
        <div className="px-5 py-4 border-b border-slate-100 bg-green-50">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Record Repayment</p>
            <button onClick={closeForms} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
          <form onSubmit={handleRepaySubmit} className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Amount (KWD) <span className="normal-case font-normal text-slate-400">— max {formatCurrency(currentBalance)}</span></label>
              <input type="number" min="0.001" step="0.001" max={currentBalance} placeholder="0.000"
                value={repayForm.amount} onChange={e => setRepay('amount', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Date</label>
              <input type="date" value={repayForm.repayment_date} onChange={e => setRepay('repayment_date', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Payment Method</label>
              <select value={repayForm.payment_method} onChange={e => setRepay('payment_method', e.target.value)} className={inputClass}>
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Notes (optional)</label>
              <input type="text" placeholder="e.g. Partial repayment" value={repayForm.notes} onChange={e => setRepay('notes', e.target.value)} className={inputClass} />
            </div>
            <div className="col-span-2 flex justify-end gap-2 pt-1">
              <button type="button" onClick={closeForms}
                className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 transition">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-60 transition">
                {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : 'Record Repayment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {history.length === 0 && !showForm ? (
        <div className="px-5 py-6 text-center text-sm text-slate-400">No advances or loans recorded</div>
      ) : (
        <div className="divide-y divide-slate-50">
          {history.map((row) => row.kind === 'advance' ? (
            <div key={`a-${row.id}`} className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${row.a.type === 'loan' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {row.a.type === 'loan' ? 'Loan' : 'Advance'}
                  </span>
                  <span className="text-slate-500 text-xs">{formatDate(row.a.issued_date)}</span>
                  {row.a.payment_method && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${row.a.payment_method === 'bank' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                      {row.a.payment_method === 'bank' ? 'Bank' : 'Cash'}
                    </span>
                  )}
                </div>
                {row.a.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">{row.a.notes}</p>}
              </div>
              <span className="font-semibold text-slate-800 whitespace-nowrap">{formatCurrency(row.a.amount)}</span>
            </div>
          ) : (
            <div key={`r-${row.id}`} className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    Repayment
                  </span>
                  <span className="text-slate-500 text-xs">{formatDate(row.r.repayment_date)}</span>
                  {row.r.payment_method && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${row.r.payment_method === 'bank' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                      {row.r.payment_method === 'bank' ? 'Bank' : 'Cash'}
                    </span>
                  )}
                </div>
                {row.r.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">{row.r.notes}</p>}
              </div>
              <span className="font-semibold text-green-700 whitespace-nowrap">−{formatCurrency(row.r.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
