'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  id: string
  complaint_number: string
  service_category: string | string[]
  priority: string
  description: string
  location: string | null
  preferred_date: string | null
  preferred_time: string | null
  notes: string | null
}

const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export function EditComplaintForm({ complaint }: { complaint: Complaint }) {
  const router = useRouter()

  const initialCategories = Array.isArray(complaint.service_category)
    ? complaint.service_category
    : complaint.service_category ? [complaint.service_category] : []

  const [categories, setCategories] = useState<string[]>(initialCategories)
  const [priority, setPriority] = useState(complaint.priority)
  const [description, setDescription] = useState(complaint.description)
  const [location, setLocation] = useState(complaint.location ?? '')
  const [preferredDate, setPreferredDate] = useState(complaint.preferred_date ?? '')
  const [preferredTime, setPreferredTime] = useState(complaint.preferred_time ?? '')
  const [notes, setNotes] = useState(complaint.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggleCategory = (val: string) =>
    setCategories((prev) => prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!categories.length) { setError('At least one service category is required'); return }
    if (!description.trim() || description.trim().length < 5) { setError('Please provide a description (at least 5 characters)'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/complaints/${complaint.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edit: true,
          service_category: categories,
          priority,
          description: description.trim(),
          location: location.trim() || null,
          preferred_date: preferredDate || null,
          preferred_time: preferredTime || null,
          notes: notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Update failed')
      router.push(`/complaints/${complaint.id}`)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Service Category */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          Service Category <span className="text-red-500">*</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SERVICE_CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => toggleCategory(c.value)}
              className={`px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all text-center ${
                categories.includes(c.value)
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-blue-200 bg-white'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Priority */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Priority</h2>
        <div className="grid grid-cols-4 gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value)}
              className={`text-center px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                priority === p.value ? p.active : `bg-white ${p.idle} hover:opacity-80`
              }`}
            >
              {p.label}
            </button>
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
            required
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls + ' resize-none'}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Location / Address</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Preferred Date</label>
            <input
              type="date"
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Preferred Time</label>
            <input
              type="time"
              value={preferredTime}
              onChange={(e) => setPreferredTime(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Internal Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputCls + ' resize-none'}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pb-6">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/complaints/${complaint.id}`)}
          className="px-6 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
