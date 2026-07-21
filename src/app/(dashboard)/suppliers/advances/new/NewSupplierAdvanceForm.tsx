'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'

interface Supplier {
  id: string
  supplier_name: string
  supplier_code: string
}

interface Props {
  suppliers: Supplier[]
  defaultSupplierId?: string
}

const PAYMENT_MODES = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'online', label: 'Online' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

export function NewSupplierAdvanceForm({ suppliers, defaultSupplierId }: Props) {
  const router = useRouter()
  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? '')
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' }))
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('bank_transfer')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!supplierId) { setError('Please select a supplier'); return }
    if (!amount || Number(amount) <= 0) { setError('Amount must be greater than zero'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/supplier-advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          advance_date: date,
          amount: Number(amount),
          payment_mode: mode,
          reference_number: reference.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to record advance')
      router.push('/suppliers/advances')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record advance')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label className={labelClass}>Supplier <span className="text-red-500">*</span></label>
        <select
          className={inputClass}
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          required
        >
          <option value="">Select supplier…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.supplier_name} {s.supplier_code ? `(${s.supplier_code})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Date <span className="text-red-500">*</span></label>
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Amount (KWD) <span className="text-red-500">*</span></label>
          <input
            type="number"
            min="0.001"
            step="0.001"
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.000"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Payment Mode</label>
          <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Reference Number</label>
          <input
            type="text"
            className={inputClass}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Cheque / transfer ref…"
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea
          className={`${inputClass} resize-none`}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes…"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? 'Recording…' : 'Record Advance'}
      </button>
    </form>
  )
}
