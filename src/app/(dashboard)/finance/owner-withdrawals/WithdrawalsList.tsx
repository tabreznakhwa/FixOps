'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Wallet, PlusCircle, Trash2, AlertCircle } from 'lucide-react'

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'pos', label: 'POS' },
  { value: 'card', label: 'Card' },
  { value: 'online', label: 'Online' },
]
const MODE_LABELS: Record<string, string> = {
  cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque',
  pos: 'POS', card: 'Card', online: 'Online',
}

interface Withdrawal {
  id: string; withdrawal_date: string; amount: number; payment_mode: string;
  purpose: string | null; notes: string | null; created_at: string
}
interface Props { withdrawals: Withdrawal[] }

export function WithdrawalsList({ withdrawals: initial }: Props) {
  const router = useRouter()
  const [withdrawals, setWithdrawals] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const blank = () => ({
    withdrawal_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' }),
    amount: '',
    payment_mode: 'cash',
    purpose: '',
    notes: '',
  })
  const [form, setForm] = useState(blank)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const amt = Number(form.amount)
    if (!form.withdrawal_date) { setError('Date is required'); return }
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/owner-withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          withdrawal_date: form.withdrawal_date,
          amount: amt,
          payment_mode: form.payment_mode,
          purpose: form.purpose || null,
          notes: form.notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return }
      setWithdrawals(prev => [data, ...prev])
      setShowForm(false)
      setForm(blank())
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this withdrawal record?')) return
    setDeletingId(id)
    try {
      await fetch('/api/owner-withdrawals', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setWithdrawals(prev => prev.filter(w => w.id !== id))
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Withdrawal History</h3>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setError('') }}
            className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            <PlusCircle className="w-4 h-4" /> Record Withdrawal
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <p className="text-sm font-semibold text-slate-700">Record Owner Withdrawal</p>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date</label>
              <input
                type="date" required value={form.withdrawal_date}
                onChange={e => setForm(f => ({ ...f, withdrawal_date: e.target.value }))}
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Amount (KWD)</label>
              <input
                type="number" required step="0.001" min="0.001" placeholder="0.000"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Withdrawn Via</label>
              <select
                value={form.payment_mode}
                onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))}
                className={inputCls}
              >
                {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Purpose <span className="font-normal text-slate-400">(optional)</span></label>
              <input
                type="text" placeholder="e.g. Personal use, Business expense paid personally"
                value={form.purpose}
                onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes <span className="font-normal text-slate-400">(optional)</span></label>
              <input
                type="text" placeholder="Additional details"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className={inputCls}
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button type="submit" disabled={saving}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
                {saving ? 'Saving…' : 'Save Withdrawal'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setError('') }}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-100 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* History */}
      {withdrawals.length === 0 ? (
        <div className="p-10 text-center">
          <Wallet className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No withdrawals recorded yet</p>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Date</th>
              <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Amount</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Via</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Purpose / Notes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {withdrawals.map(w => (
              <tr key={w.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(w.withdrawal_date)}</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(w.amount)}</td>
                <td className="px-4 py-3">
                  <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                    {MODE_LABELS[w.payment_mode] ?? w.payment_mode}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {w.purpose && <span className="font-medium">{w.purpose}</span>}
                  {w.purpose && w.notes && <span className="text-slate-400 mx-1">·</span>}
                  {w.notes && <span className="text-slate-400 text-xs">{w.notes}</span>}
                  {!w.purpose && !w.notes && <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(w.id)}
                    disabled={deletingId === w.id}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-300 hover:text-red-400 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
