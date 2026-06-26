'use client'

import { useState } from 'react'

interface Customer {
  id: string
  full_name: string
  company_name: string | null
  mobile_number: string
}

interface Props {
  customers: Customer[]
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

const SERVICES = ['AC Maintenance', 'Plumbing', 'Electrical', 'General']

export function NewAMCForm({ customers }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [services, setServices] = useState<string[]>([])

  function toggleService(s: string) {
    setServices((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const fd = new FormData(e.currentTarget)
    const body = {
      customer_id: fd.get('customer_id') as string,
      contract_type: fd.get('contract_type') as string,
      start_date: fd.get('start_date') as string,
      end_date: fd.get('end_date') as string,
      contract_amount: Number(fd.get('contract_amount')),
      billing_frequency: fd.get('billing_frequency') as string,
      services_included: services,
      visits_included: Number(fd.get('visits_included') ?? 0),
      parts_included: fd.get('parts_included') === 'on',
      payment_terms: Number(fd.get('payment_terms') ?? 0),
      notes: fd.get('notes') as string,
    }

    if (!body.customer_id) {
      setError('Please select a customer')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/amc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create contract')
        setLoading(false)
        return
      }
      window.location.href = `/amc/${data.id}`
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Contract Details</h2>

        {/* Customer */}
        <div>
          <label className={labelClass}>Customer <span className="text-red-500">*</span></label>
          <select name="customer_id" required className={inputClass}>
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name ? `${c.company_name} — ${c.full_name}` : c.full_name}
              </option>
            ))}
          </select>
        </div>

        {/* Contract Type */}
        <div>
          <label className={labelClass}>Contract Type</label>
          <select name="contract_type" className={inputClass}>
            <option value="comprehensive">Comprehensive</option>
            <option value="preventive">Preventive</option>
            <option value="corrective">Corrective</option>
            <option value="full_service">Full Service</option>
          </select>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Start Date <span className="text-red-500">*</span></label>
            <input type="date" name="start_date" required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>End Date <span className="text-red-500">*</span></label>
            <input type="date" name="end_date" required className={inputClass} />
          </div>
        </div>

        {/* Amount + Frequency */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Contract Amount (KWD)</label>
            <input type="number" name="contract_amount" min="0" step="0.01" defaultValue="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Billing Frequency</label>
            <select name="billing_frequency" className={inputClass}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="half_yearly">Half Yearly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
        </div>

        {/* Payment Terms */}
        <div>
          <label className={labelClass}>Payment Terms (days)</label>
          <select name="payment_terms" className={inputClass}>
            <option value="0">Due on Receipt</option>
            <option value="7">Net 7</option>
            <option value="14">Net 14</option>
            <option value="30">Net 30</option>
          </select>
        </div>
      </div>

      {/* Services & Visits */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Services & Visits</h2>

        <div>
          <label className={labelClass}>Services Included</label>
          <div className="grid grid-cols-2 gap-2">
            {SERVICES.map((s) => (
              <label key={s} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={services.includes(s)}
                  onChange={() => toggleService(s)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700 group-hover:text-slate-900">{s}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Visits Included</label>
            <input type="number" name="visits_included" min="0" defaultValue="0" className={inputClass} />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" name="parts_included" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm font-medium text-slate-700">Parts Included</span>
            </label>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <label className={labelClass}>Notes</label>
        <textarea name="notes" rows={3} placeholder="Any additional notes…" className={inputClass} />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Creating…' : 'Create Contract'}
        </button>
        <a href="/amc" className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-900 transition-colors">
          Cancel
        </a>
      </div>
    </form>
  )
}
