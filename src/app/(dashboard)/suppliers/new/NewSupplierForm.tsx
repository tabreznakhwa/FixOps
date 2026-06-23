'use client'

import { useState } from 'react'

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

export function NewSupplierForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const fd = new FormData(e.currentTarget)
    const body = {
      supplier_name: fd.get('supplier_name') as string,
      contact_person: fd.get('contact_person') as string,
      mobile_number: fd.get('mobile_number') as string,
      email: fd.get('email') as string,
      city: fd.get('city') as string,
      address: fd.get('address') as string,
      payment_terms: Number(fd.get('payment_terms') ?? 0),
      notes: fd.get('notes') as string,
    }

    if (!body.supplier_name?.trim()) {
      setError('Supplier name is required')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create supplier')
        setLoading(false)
        return
      }
      window.location.href = '/suppliers'
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Supplier Information</h2>

        <div>
          <label className={labelClass}>Supplier Name <span className="text-red-500">*</span></label>
          <input type="text" name="supplier_name" required placeholder="e.g. Gulf AC Trading LLC" className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Contact Person</label>
            <input type="text" name="contact_person" placeholder="e.g. Ahmed Al-Rashid" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Mobile Number</label>
            <input type="tel" name="mobile_number" placeholder="+971 50 000 0000" className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" name="email" placeholder="supplier@example.com" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>City</label>
            <input type="text" name="city" placeholder="e.g. Dubai" className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Address</label>
          <textarea name="address" rows={2} placeholder="Full address…" className={inputClass} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Terms</h2>

        <div>
          <label className={labelClass}>Payment Terms (days)</label>
          <select name="payment_terms" className={inputClass}>
            <option value="0">Due on Receipt</option>
            <option value="7">Net 7</option>
            <option value="14">Net 14</option>
            <option value="30">Net 30</option>
            <option value="60">Net 60</option>
            <option value="90">Net 90</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea name="notes" rows={3} placeholder="Any additional notes…" className={inputClass} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Adding…' : 'Add Supplier'}
        </button>
        <a href="/suppliers" className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-900 transition-colors">
          Cancel
        </a>
      </div>
    </form>
  )
}
