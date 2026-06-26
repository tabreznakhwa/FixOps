'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, ChevronDown } from 'lucide-react'

const CATEGORIES = [
  { value: 'rent', label: 'Rent' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'water', label: 'Water' },
  { value: 'phone', label: 'Phone / Mobile' },
  { value: 'internet', label: 'Internet' },
  { value: 'stationery', label: 'Stationery & Office Supplies' },
  { value: 'fuel', label: 'Fuel & Transport' },
  { value: 'vehicle_maintenance', label: 'Vehicle Maintenance' },
  { value: 'tools_equipment', label: 'Tools & Equipment' },
  { value: 'marketing', label: 'Marketing & Advertising' },
  { value: 'bank_charges', label: 'Bank Charges' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'professional_services', label: 'Professional Services' },
  { value: 'food_entertainment', label: 'Food & Refreshments' },
  { value: 'other', label: 'Miscellaneous / Other' },
]

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
]

export function NewExpenseForm() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    expense_date: today,
    category: 'rent',
    description: '',
    amount: '',
    payment_method: 'cash',
    reference_number: '',
    notes: '',
  })

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.description.trim()) { setError('Please enter a description'); return }
    if (!form.amount || Number(form.amount) <= 0) { setError('Please enter a valid amount'); return }

    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expense_date: form.expense_date,
          category: form.category,
          description: form.description.trim(),
          amount: Number(form.amount),
          payment_method: form.payment_method,
          reference_number: form.reference_number.trim() || null,
          notes: form.notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push('/finance/expenses')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save expense')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white'
  const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Main details */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-900">Expense Details</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Date <span className="text-red-500">*</span></label>
            <input type="date" value={form.expense_date} onChange={set('expense_date')} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Category <span className="text-red-500">*</span></label>
            <div className="relative">
              <select value={form.category} onChange={set('category')} className={inputClass + ' appearance-none pr-9'}>
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        <div>
          <label className={labelClass}>Description <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.description}
            onChange={set('description')}
            placeholder="e.g. June office rent, Electricity bill #1234…"
            className={inputClass}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Amount (KWD) <span className="text-red-500">*</span></label>
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={form.amount}
              onChange={set('amount')}
              placeholder="0.000"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Payment Method <span className="text-red-500">*</span></label>
            <div className="relative">
              <select value={form.payment_method} onChange={set('payment_method')} className={inputClass + ' appearance-none pr-9'}>
                {PAYMENT_METHODS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        <div>
          <label className={labelClass}>
            Reference No. <span className="text-slate-400 font-normal">(optional — cheque no., bill no., etc.)</span>
          </label>
          <input
            type="text"
            value={form.reference_number}
            onChange={set('reference_number')}
            placeholder="e.g. CHQ-00123 or BILL-456"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>
            Notes <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={2}
            placeholder="Any additional notes…"
            className={inputClass + ' resize-none'}
          />
        </div>
      </div>

      {/* Payment method note */}
      <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">
        {form.payment_method === 'cash'
          ? 'This expense will appear as a payment in the Cash Book.'
          : 'This expense will appear as a payment in the Bank Book.'}
      </div>

      <div className="flex items-center justify-end gap-3 pb-6">
        <button type="button" onClick={() => router.back()}
          className="px-5 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition">
          Cancel
        </button>
        <button type="submit" disabled={submitting}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition">
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Expense'}
        </button>
      </div>
    </form>
  )
}
