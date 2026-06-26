'use client'

import { useActionState, useState } from 'react'
import { updateComplaint } from '../../actions'
import Link from 'next/link'
import { Loader2, AlertCircle } from 'lucide-react'

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

const PRIORITIES = [
  { value: 'low', label: 'Low', active: 'bg-slate-600 border-slate-600 text-white', idle: 'border-slate-300 text-slate-700' },
  { value: 'medium', label: 'Medium', active: 'bg-blue-600 border-blue-600 text-white', idle: 'border-blue-200 text-blue-700' },
  { value: 'high', label: 'High', active: 'bg-orange-500 border-orange-500 text-white', idle: 'border-orange-200 text-orange-700' },
  { value: 'emergency', label: 'Emergency', active: 'bg-red-600 border-red-600 text-white', idle: 'border-red-200 text-red-700' },
]

interface Complaint {
  id: string; complaint_number: string; service_category: string | string[];
  priority: string; description: string; location: string | null;
  preferred_date: string | null; preferred_time: string | null; notes: string | null;
}

export function EditComplaintForm({ complaint }: { complaint: Complaint }) {
  const [state, action, pending] = useActionState(updateComplaint, null)

  const initialCategories = Array.isArray(complaint.service_category)
    ? complaint.service_category
    : complaint.service_category ? [complaint.service_category] : []

  const [categories, setCategories] = useState<string[]>(initialCategories)
  const [priority, setPriority] = useState(complaint.priority)

  const toggleCategory = (val: string) =>
    setCategories(prev => prev.includes(val) ? prev.filter(c => c !== val) : [...prev, val])

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="id" value={complaint.id} />

      {state?.error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {state.error}
        </div>
      )}

      {/* Service Category */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          Service Category <span className="text-red-500">*</span>
        </h2>
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
                priority === p.value ? p.active : `bg-white ${p.idle} hover:opacity-80`
              }`}>
                {p.label}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Description & Details */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Details</h2>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            name="description"
            required
            rows={4}
            defaultValue={complaint.description}
            className={inputCls + ' resize-none'}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Location / Address</label>
          <input
            type="text"
            name="location"
            defaultValue={complaint.location ?? ''}
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Preferred Date</label>
            <input
              type="date"
              name="preferred_date"
              defaultValue={complaint.preferred_date ?? ''}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Preferred Time</label>
            <input
              type="time"
              name="preferred_time"
              defaultValue={complaint.preferred_time ?? ''}
              className={inputCls}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Internal Notes</label>
          <textarea
            name="notes"
            rows={2}
            defaultValue={complaint.notes ?? ''}
            className={inputCls + ' resize-none'}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pb-6">
        <button type="submit" disabled={pending}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
          {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Changes'}
        </button>
        <Link href={`/complaints/${complaint.id}`}
          className="px-6 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">
          Cancel
        </Link>
      </div>
    </form>
  )
}
