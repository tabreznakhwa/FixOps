'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'

const PAYMENT_MODES = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'pos', label: 'POS' },
  { value: 'online', label: 'Online' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]

interface Props {
  payment: {
    id: string; payment_date: string; amount_paid: number; discount_amount: number | null
    payment_mode: string; reference_number: string | null; notes: string | null
    suppliers: { supplier_name: string; supplier_code: string } | null
    purchase_orders: { po_number: string } | null
  }
}

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

export function EditVendorPaymentForm({ payment }: Props) {
  const [mode, setMode] = useState(payment.payment_mode)
  const [reference, setReference] = useState(payment.reference_number ?? '')
  const [notes, setNotes] = useState(payment.notes ?? '')
  const [date, setDate] = useState(payment.payment_date)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/suppliers/payments/${payment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_mode: mode, reference_number: reference, notes, payment_date: date }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Update failed'); return }
      window.location.href = '/suppliers/vendor-payments'
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {/* Read-only info */}
      <div className="bg-slate-50 rounded-lg p-4 space-y-1 text-sm">
        <p className="font-semibold text-slate-800">{payment.suppliers?.supplier_name} <span className="text-slate-400 font-mono text-xs">({payment.suppliers?.supplier_code})</span></p>
        {payment.purchase_orders && <p className="text-slate-500">PO: {payment.purchase_orders.po_number}</p>}
        <p className="text-slate-500">Amount: <span className="font-semibold text-red-600">{formatCurrency(payment.amount_paid)}</span>
          {payment.discount_amount ? <span className="ml-2 text-amber-600">· Discount: {formatCurrency(payment.discount_amount)}</span> : null}
        </p>
      </div>

      <div>
        <label className={labelClass}>Payment Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Payment Mode</label>
        <select value={mode} onChange={e => setMode(e.target.value)} className={inputClass}>
          {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      <div>
        <label className={labelClass}>Reference / Cheque No.</label>
        <input type="text" value={reference} onChange={e => setReference(e.target.value)}
          placeholder="e.g. CHQ-12345 or TXN-REF" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Optional remarks…" className={inputClass} />
      </div>

      <button type="submit" disabled={loading}
        className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
        {loading ? 'Saving…' : 'Save Changes'}
      </button>
    </form>
  )
}
