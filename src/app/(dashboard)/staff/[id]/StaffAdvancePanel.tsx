'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, X } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Advance {
  id: string
  type: string
  amount: number
  issued_date: string
  notes: string | null
}

interface Props {
  staffId: string
  currentBalance: number
  advances: Advance[]
}

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1'

export function StaffAdvancePanel({ staffId, currentBalance, advances }: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    type: 'advance',
    amount: '',
    issued_date: new Date().toISOString().split('T')[0],
    notes: '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
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
      setShowForm(false)
      setForm({ type: 'advance', amount: '', issued_date: new Date().toISOString().split('T')[0], notes: '' })
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record advance')
    } finally {
      setLoading(false)
    }
  }

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
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Record
          </button>
        )}
      </div>

      {showForm && (
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">New Advance / Loan</p>
            <button onClick={() => { setShowForm(false); setError('') }} className="text-slate-400 hover:text-slate-600">
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
              <label className={labelClass}>Notes (optional)</label>
              <input type="text" placeholder="e.g. Emergency advance" value={form.notes} onChange={e => set('notes', e.target.value)} className={inputClass} />
            </div>
            <div className="col-span-2 flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setShowForm(false); setError('') }}
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

      {advances.length === 0 && !showForm ? (
        <div className="px-5 py-6 text-center text-sm text-slate-400">No advances or loans recorded</div>
      ) : (
        <div className="divide-y divide-slate-50">
          {advances.map((a) => (
            <div key={a.id} className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${a.type === 'loan' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {a.type === 'loan' ? 'Loan' : 'Advance'}
                  </span>
                  <span className="text-slate-500 text-xs">{formatDate(a.issued_date)}</span>
                </div>
                {a.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">{a.notes}</p>}
              </div>
              <span className="font-semibold text-slate-800 whitespace-nowrap">{formatCurrency(a.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
