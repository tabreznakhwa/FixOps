'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Gift, X } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Bonus {
  id: string
  bonus_date: string
  amount: number
  payment_mode: string
  notes: string | null
}

interface Props {
  staffId: string
  bonuses: Bonus[]
  canEdit: boolean
}

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1'

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'pos', label: 'POS' },
  { value: 'card', label: 'Card' },
  { value: 'online', label: 'Online' },
  { value: 'knet', label: 'KNET' },
]
const MODE_LABELS: Record<string, string> = {
  cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque',
  pos: 'POS', card: 'Card', online: 'Online', knet: 'KNET',
}

function todayKuwait() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })
}

export function StaffBonusPanel({ staffId, bonuses, canEdit }: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [form, setForm] = useState({
    bonus_date: todayKuwait(),
    amount: '',
    payment_mode: 'cash',
    notes: '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function openForm() {
    setForm({ bonus_date: todayKuwait(), amount: '', payment_mode: 'cash', notes: '' })
    setIdempotencyKey(crypto.randomUUID())
    setError('')
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount || Number(form.amount) <= 0) { setError('Enter a valid amount'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/staff-bonuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: staffId,
          bonus_date: form.bonus_date,
          amount: Number(form.amount),
          payment_mode: form.payment_mode,
          notes: form.notes || null,
          idempotency_key: idempotencyKey,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to record bonus')
      setShowForm(false)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record bonus')
    } finally {
      setLoading(false)
    }
  }

  const sorted = [...bonuses].sort((a, b) => b.bonus_date.localeCompare(a.bonus_date))

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="w-4 h-4 text-purple-500" />
          <h3 className="text-sm font-semibold text-slate-900">Bonuses</h3>
        </div>
        {canEdit && !showForm && (
          <button
            onClick={openForm}
            className="px-3 py-1.5 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 transition-colors"
          >
            Record Bonus
          </button>
        )}
      </div>

      {showForm && (
        <div className="px-5 py-4 border-b border-slate-100 bg-purple-50/40">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Record a Bonus</p>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Amount (KWD)</label>
              <input type="number" min="0.001" step="0.001" placeholder="0.000"
                value={form.amount} onChange={e => set('amount', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Date</label>
              <input type="date" value={form.bonus_date} onChange={e => set('bonus_date', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Paid Via</label>
              <select value={form.payment_mode} onChange={e => set('payment_mode', e.target.value)} className={inputClass}>
                {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Reason / Notes</label>
              <input type="text" placeholder="e.g. Outstanding performance"
                value={form.notes} onChange={e => set('notes', e.target.value)} className={inputClass} />
            </div>
            <div className="col-span-2 flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 transition">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-60 transition">
                {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : 'Save Bonus'}
              </button>
            </div>
          </form>
        </div>
      )}

      {sorted.length === 0 && !showForm ? (
        <div className="px-5 py-6 text-center text-sm text-slate-400">No bonuses recorded</div>
      ) : (
        <div className="divide-y divide-slate-50">
          {sorted.map(b => (
            <div key={b.id} className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Bonus</span>
                  <span className="text-slate-500 text-xs">{formatDate(b.bonus_date)}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${b.payment_mode === 'cash' ? 'bg-slate-100 text-slate-600' : 'bg-indigo-100 text-indigo-700'}`}>
                    {MODE_LABELS[b.payment_mode] ?? b.payment_mode}
                  </span>
                </div>
                {b.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">{b.notes}</p>}
              </div>
              <span className="font-semibold text-purple-700 whitespace-nowrap">{formatCurrency(b.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
