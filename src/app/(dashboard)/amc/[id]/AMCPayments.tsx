'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PlusCircle, DollarSign, Trash2, AlertCircle } from 'lucide-react'

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'pos', label: 'POS' },
  { value: 'card', label: 'Card' },
  { value: 'online', label: 'Online' },
  { value: 'other', label: 'Other' },
]

const MODE_LABELS: Record<string, string> = {
  cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque',
  pos: 'POS', card: 'Card', online: 'Online', other: 'Other',
}

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

interface Payment {
  id: string
  payment_date: string
  amount: number
  payment_mode: string
  reference_number: string | null
  notes: string | null
  is_pre_opening: boolean
}

interface Props {
  contractId: string
  contractAmount: number
  payments: Payment[]
}

export function AMCPayments({ contractId, contractAmount, payments: initialPayments }: Props) {
  const router = useRouter()
  const [payments, setPayments] = useState(initialPayments)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const todayStr = () => new Date().toISOString().split('T')[0]
  const blankForm = () => ({
    payment_date: todayStr(),
    amount: '',
    payment_mode: 'cash',
    reference_number: '',
    notes: '',
    is_pre_opening: false,
  })
  const [form, setForm] = useState(blankForm)

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)
  const balance = contractAmount - totalPaid
  const paidPct = contractAmount > 0 ? Math.min((totalPaid / contractAmount) * 100, 100) : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const amt = Number(form.amount)
    if (!form.payment_date) { setError('Payment date is required'); return }
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/amc/${contractId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_date: form.payment_date,
          amount: amt,
          payment_mode: form.payment_mode,
          reference_number: form.reference_number || null,
          notes: form.notes || null,
          is_pre_opening: form.is_pre_opening,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to save payment'); return }
      setPayments(prev =>
        [data, ...prev].sort((a, b) => b.payment_date.localeCompare(a.payment_date))
      )
      setShowForm(false)
      setForm(blankForm())
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(paymentId: string) {
    if (!confirm('Delete this payment?')) return
    setDeletingId(paymentId)
    try {
      const res = await fetch(`/api/amc/${contractId}/payments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: paymentId }),
      })
      if (!res.ok) { alert('Could not delete payment'); return }
      setPayments(prev => prev.filter(p => p.id !== paymentId))
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payments Received</h3>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setError('') }}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            <PlusCircle className="w-3.5 h-3.5" /> Record Payment
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-sm mb-1.5">
          <span className="text-slate-500">Amount Paid</span>
          <span className="font-bold text-slate-900">
            {formatCurrency(totalPaid)}{' '}
            <span className="text-slate-400 font-normal">/ {formatCurrency(contractAmount)}</span>
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${paidPct >= 100 ? 'bg-green-500' : paidPct >= 50 ? 'bg-blue-500' : 'bg-amber-400'}`}
            style={{ width: `${paidPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs mt-1.5">
          <span className={`font-semibold ${balance <= 0 ? 'text-green-600' : 'text-amber-600'}`}>
            {balance <= 0 ? 'Fully Paid' : `Balance Due: ${formatCurrency(balance)}`}
          </span>
          <span className="text-slate-400">{paidPct.toFixed(0)}%</span>
        </div>
      </div>

      {/* Record payment form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Record Payment</p>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 font-medium">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Payment Date</label>
            <input
              type="date"
              required
              value={form.payment_date}
              onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Amount (KWD)</label>
            <input
              type="number"
              required
              step="0.001"
              min="0.001"
              placeholder="0.000"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Payment Mode</label>
            <select
              value={form.payment_mode}
              onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))}
              className={inputCls}
            >
              {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Reference No. <span className="font-normal text-slate-400">(optional)</span></label>
            <input
              type="text"
              placeholder="Cheque no. / transfer ref"
              value={form.reference_number}
              onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes <span className="font-normal text-slate-400">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. 50% advance payment"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className={inputCls}
            />
          </div>

          {/* Pre-opening balance checkbox */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none bg-amber-50 border border-amber-200 rounded-lg p-3">
            <input
              type="checkbox"
              checked={form.is_pre_opening}
              onChange={e => setForm(f => ({ ...f, is_pre_opening: e.target.checked }))}
              className="mt-0.5 w-4 h-4 accent-amber-500"
            />
            <div>
              <p className="text-xs font-semibold text-amber-800">Already in opening balance</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Tick if this payment was received before you started using the system and is already included in your opening cash/bank balance. It will show on this contract but will <strong>not</strong> appear in Cash/Bank Book again.
              </p>
            </div>
          </label>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Payment'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError('') }}
              className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Payment history */}
      {payments.length === 0 ? (
        <div className="text-center py-4">
          <DollarSign className="w-6 h-6 text-slate-300 mx-auto mb-1" />
          <p className="text-xs text-slate-400">No payments recorded yet</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {payments.map(p => (
            <div key={p.id} className="py-3 flex items-start justify-between gap-2 group">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900">{formatCurrency(p.amount)}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatDate(p.payment_date)}
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md">
                    {MODE_LABELS[p.payment_mode] ?? p.payment_mode}
                  </span>
                  {p.reference_number && (
                    <span className="ml-1.5 font-mono text-slate-400">{p.reference_number}</span>
                  )}
                </p>
                {p.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{p.notes}</p>}
                {p.is_pre_opening && (
                  <span className="inline-block mt-1 text-xs bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-md font-medium">
                    Pre-opening balance
                  </span>
                )}
              </div>
              <button
                onClick={() => handleDelete(p.id)}
                disabled={deletingId === p.id}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-300 hover:text-red-400 rounded"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
