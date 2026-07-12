'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeftRight, PlusCircle, Trash2, AlertCircle, ArrowRight } from 'lucide-react'

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

interface Transfer {
  id: string; transfer_date: string; from_account: string; to_account: string
  amount: number; reference_number: string | null; notes: string | null; created_at: string
}

interface Props { transfers: Transfer[] }

const ACCOUNT_LABEL: Record<string, string> = { cash: 'Cash', bank: 'Bank' }

export function FundTransfersList({ transfers: initial }: Props) {
  const router = useRouter()
  const [transfers, setTransfers] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const blank = () => ({
    transfer_date: new Date().toISOString().split('T')[0],
    from_account: 'cash',
    amount: '',
    reference_number: '',
    notes: '',
  })
  const [form, setForm] = useState(blank)

  const toAccount = form.from_account === 'cash' ? 'bank' : 'cash'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const amt = Number(form.amount)
    if (!form.transfer_date) { setError('Date is required'); return }
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/fund-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transfer_date: form.transfer_date,
          from_account: form.from_account,
          to_account: toAccount,
          amount: amt,
          reference_number: form.reference_number || null,
          notes: form.notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return }
      setTransfers(prev => [data, ...prev])
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
    if (!confirm('Delete this transfer?')) return
    setDeletingId(id)
    try {
      await fetch('/api/fund-transfers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setTransfers(prev => prev.filter(t => t.id !== id))
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Transfer History</h3>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setError('') }}
            className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            <PlusCircle className="w-4 h-4" /> New Transfer
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <p className="text-sm font-semibold text-slate-700">Record Transfer</p>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Transfer Date</label>
              <input
                type="date" required value={form.transfer_date}
                onChange={e => setForm(f => ({ ...f, transfer_date: e.target.value }))}
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Transfer Direction</label>
              <div className="flex items-center gap-3">
                <select
                  value={form.from_account}
                  onChange={e => setForm(f => ({ ...f, from_account: e.target.value }))}
                  className={inputCls}
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                </select>
                <ArrowRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <div className={`${inputCls} bg-slate-100 text-slate-500 cursor-not-allowed`}>
                  {ACCOUNT_LABEL[toAccount]}
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Money moves from <strong>{ACCOUNT_LABEL[form.from_account]}</strong> into <strong>{ACCOUNT_LABEL[toAccount]}</strong>
              </p>
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
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Reference No. <span className="font-normal text-slate-400">(optional)</span></label>
              <input
                type="text" placeholder="Slip / ref number"
                value={form.reference_number}
                onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))}
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes <span className="font-normal text-slate-400">(optional)</span></label>
              <input
                type="text" placeholder="e.g. Deposited cash to KNET machine"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className={inputCls}
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button type="submit" disabled={saving}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
                {saving ? 'Saving…' : 'Save Transfer'}
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
      {transfers.length === 0 ? (
        <div className="p-10 text-center">
          <ArrowLeftRight className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No transfers recorded yet</p>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Date</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Direction</th>
              <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Amount</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Ref / Notes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {transfers.map(t => (
              <tr key={t.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(t.transfer_date)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className={`font-semibold ${t.from_account === 'cash' ? 'text-green-700' : 'text-blue-700'}`}>
                      {ACCOUNT_LABEL[t.from_account]}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className={`font-semibold ${t.to_account === 'bank' ? 'text-blue-700' : 'text-green-700'}`}>
                      {ACCOUNT_LABEL[t.to_account]}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">{formatCurrency(t.amount)}</td>
                <td className="px-4 py-3 text-sm text-slate-500">
                  {t.reference_number && <span className="font-mono text-xs text-slate-400 mr-2">{t.reference_number}</span>}
                  {t.notes ?? '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(t.id)}
                    disabled={deletingId === t.id}
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
