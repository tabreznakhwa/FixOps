'use client'

import { useActionState, useState } from 'react'
import { createComplaint } from '@/app/(dashboard)/complaints/actions'
import { Loader2, AlertCircle, Search } from 'lucide-react'

const SERVICE_CATEGORIES = [
  { value: 'ac_maintenance', label: '❄️ AC Maintenance' },
  { value: 'plumbing', label: '🔧 Plumbing' },
  { value: 'electrical', label: '⚡ Electrical' },
  { value: 'installation', label: '🏗️ Installation' },
  { value: 'inspection', label: '🔍 Inspection' },
  { value: 'general', label: '🔨 General' },
  { value: 'emergency', label: '🚨 Emergency' },
  { value: 'quotation', label: '📝 Quotation' },
]

const SOURCES = [
  { value: 'phone', label: '📞 Phone' },
  { value: 'whatsapp', label: '💬 WhatsApp' },
  { value: 'email', label: '📧 Email' },
  { value: 'walk_in', label: '🚶 Walk-in' },
  { value: 'admin_entry', label: '💻 Admin Entry' },
]

const PRIORITIES = [
  { value: 'low', label: 'Low', cls: 'border-slate-300 text-slate-700', active: 'bg-slate-600 border-slate-600 text-white' },
  { value: 'medium', label: 'Medium', cls: 'border-blue-200 text-blue-700', active: 'bg-blue-600 border-blue-600 text-white' },
  { value: 'high', label: 'High', cls: 'border-orange-200 text-orange-700', active: 'bg-orange-500 border-orange-500 text-white' },
  { value: 'emergency', label: 'Emergency', cls: 'border-red-200 text-red-700', active: 'bg-red-600 border-red-600 text-white' },
]

interface Props {
  customers: { id: string; full_name: string; company_name: string | null; mobile_number: string; customer_code: string }[]
  technicians: { id: string; full_name: string }[]
}

export function NewComplaintForm({ customers, technicians }: Props) {
  const [state, action, pending] = useActionState(createComplaint, null)
  const [priority, setPriority] = useState('medium')
  const [source, setSource] = useState('admin_entry')
  const [categories, setCategories] = useState<string[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Props['customers'][0] | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  const toggleCategory = (val: string) =>
    setCategories((prev) => prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val])

  const filteredCustomers = customers.filter((c) => {
    const q = customerSearch.toLowerCase()
    return (
      c.full_name.toLowerCase().includes(q) ||
      (c.company_name?.toLowerCase().includes(q) ?? false) ||
      c.mobile_number.includes(q) ||
      c.customer_code.toLowerCase().includes(q)
    )
  }).slice(0, 8)

  return (
    <form action={action} className="space-y-6">
      {state?.error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {state.error}
        </div>
      )}

      {/* Customer Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">
          Customer <span className="text-red-500">*</span>
        </h2>

        {selectedCustomer ? (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{selectedCustomer.full_name}</p>
              {selectedCustomer.company_name && (
                <p className="text-xs text-slate-500">{selectedCustomer.company_name}</p>
              )}
              <p className="text-xs text-slate-500">{selectedCustomer.mobile_number}</p>
            </div>
            <button
              type="button"
              onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Change
            </button>
            <input type="hidden" name="customer_id" value={selectedCustomer.id} />
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={customerSearch}
              onChange={(e) => { setCustomerSearch(e.target.value); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Search by name, mobile, or code..."
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {showDropdown && customerSearch && (
              <div className="absolute z-10 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                {filteredCustomers.length === 0 ? (
                  <p className="text-sm text-slate-400 px-4 py-3">No customers found</p>
                ) : (
                  filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setSelectedCustomer(c); setShowDropdown(false); setCustomerSearch('') }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                    >
                      <p className="text-sm font-semibold text-slate-800">{c.full_name}</p>
                      <p className="text-xs text-slate-500">{c.mobile_number} · {c.customer_code}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {customers.length === 0 && (
          <p className="text-xs text-slate-500 mt-2">
            No customers yet.{' '}
            <a href="/customers/new" className="text-blue-600 underline">Add one first</a>.
          </p>
        )}
      </div>

      {/* Source & Category */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Source</h2>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((s) => (
              <label key={s.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="complaint_source"
                  value={s.value}
                  checked={source === s.value}
                  onChange={() => setSource(s.value)}
                  className="sr-only"
                />
                <span className={`inline-block px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  source === s.value
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-slate-200 text-slate-600 hover:border-blue-300'
                }`}>
                  {s.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-1">
            Service Category <span className="text-red-500">*</span>
          </h2>
          <p className="text-xs text-slate-400 mb-3">Select all that apply</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SERVICE_CATEGORIES.map((c) => (
              <label key={c.value} className="cursor-pointer">
                <input
                  type="checkbox"
                  name="service_category"
                  value={c.value}
                  checked={categories.includes(c.value)}
                  onChange={() => toggleCategory(c.value)}
                  className="sr-only"
                />
                <div className={`px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all text-center ${
                  categories.includes(c.value)
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-slate-200 text-slate-600 hover:border-blue-200'
                }`}>
                  {c.label}
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Priority */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Priority</h2>
        <div className="grid grid-cols-4 gap-2">
          {PRIORITIES.map((p) => (
            <label key={p.value} className="cursor-pointer">
              <input
                type="radio"
                name="priority"
                value={p.value}
                checked={priority === p.value}
                onChange={() => setPriority(p.value)}
                className="sr-only"
              />
              <div className={`text-center px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                priority === p.value ? p.active : `bg-white ${p.cls} hover:opacity-80`
              }`}>
                {p.label}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Description & Details */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            name="description"
            required
            rows={4}
            placeholder="Describe the issue — what's the problem, when did it start, any relevant details..."
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Location / Address</label>
          <input
            type="text"
            name="location"
            placeholder="e.g. Dubai Marina, Villa 12, Flat 304"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Preferred Date</label>
            <input
              type="date"
              name="preferred_date"
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Preferred Time</label>
            <input
              type="time"
              name="preferred_time"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Assign Technician */}
      {technicians.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <label className="block text-sm font-semibold text-slate-700 mb-3">
            Assign Technician <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <select
            name="assigned_to"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">— Unassigned —</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Log Complaint'}
        </button>
        <a href="/complaints" className="px-6 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">
          Cancel
        </a>
      </div>
    </form>
  )
}
