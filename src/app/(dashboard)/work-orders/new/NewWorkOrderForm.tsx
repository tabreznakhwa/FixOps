'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, ChevronDown, X } from 'lucide-react'

const PRIORITIES = ['low', 'medium', 'high', 'emergency'] as const
const SERVICE_CATEGORIES = [
  { value: 'ac_maintenance', label: 'AC Maintenance' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'general', label: 'General Maintenance' },
  { value: 'installation', label: 'Installation' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'quotation', label: 'Quotation' },
  { value: 'emergency', label: 'Emergency' },
]

interface Customer { id: string; full_name: string; mobile_number: string | null; company_name: string | null }
interface Person { id: string; full_name: string; type: 'user' | 'staff'; role: string }
interface Complaint {
  id: string; complaint_number: string; description: string
  priority: string; customer_id: string
}
interface Prefill {
  complaint_id: string; customer_id: string; priority: string
  category: string; job_description: string; complaint_number: string
  assigned_key: string; technician_name: string
}

function CustomerCombobox({ customers, value, onChange }: { customers: Customer[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const selected = customers.find(c => c.id === value)
  const filtered = search.trim()
    ? customers.filter(c =>
        c.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (c.company_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (c.mobile_number ?? '').includes(search)
      )
    : customers

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (id: string) => { onChange(id); setOpen(false); setSearch('') }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
        {selected ? (
          <span className="text-slate-900 truncate">
            {selected.full_name}{selected.company_name ? ` — ${selected.company_name}` : ''}
            {selected.mobile_number ? <span className="text-slate-400 ml-1">· {selected.mobile_number}</span> : null}
          </span>
        ) : <span className="text-slate-400">Select a customer…</span>}
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {selected && (
            <span role="button" onClick={e => { e.stopPropagation(); select('') }}
              className="p-0.5 text-slate-400 hover:text-red-400 rounded cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </div>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus type="text" placeholder="Search name, company, phone…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full text-sm text-slate-900 placeholder-slate-400 px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0
              ? <p className="text-sm text-slate-400 px-3 py-3 text-center">No customers found</p>
              : filtered.map(c => (
                  <button key={c.id} type="button" onClick={() => select(c.id)}
                    className={`w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 transition flex items-center justify-between gap-2 ${value === c.id ? 'bg-blue-50 font-semibold' : ''}`}>
                    <span className="text-slate-900 truncate">
                      {c.full_name}{c.company_name ? <span className="text-slate-400 font-normal"> — {c.company_name}</span> : null}
                    </span>
                    {c.mobile_number && <span className="text-xs text-slate-400 flex-shrink-0">{c.mobile_number}</span>}
                  </button>
                ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface Props {
  customers: Customer[]
  technicians: Person[]
  complaints: Complaint[]
  prefill?: Prefill | null
}

export function NewWorkOrderForm({ customers, technicians, complaints, prefill }: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    customer_id: prefill?.customer_id ?? '',
    complaint_id: prefill?.complaint_id ?? '',
    assigned_key: prefill?.assigned_key ?? '', // format: "user:UUID" or "staff:UUID"
    service_category: prefill?.category ?? 'ac_maintenance',
    priority: prefill?.priority ?? 'medium',
    job_description: prefill?.job_description ?? '',
    scheduled_date: '',
    scheduled_time: '',
    estimated_hours: '',
    estimated_amount: '',
    notes: '',
  })

  // Apply prefill values after mount (useState initializer can miss them in Next.js)
  useEffect(() => {
    if (!prefill) return
    setForm(f => ({
      ...f,
      complaint_id: prefill.complaint_id,
      customer_id: prefill.customer_id,
      priority: prefill.priority.toLowerCase(),
      service_category: prefill.category.toLowerCase(),
      job_description: prefill.job_description,
      assigned_key: prefill.assigned_key,
    }))
  }, [prefill?.complaint_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleComplaintChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    if (!id) { setForm(f => ({ ...f, complaint_id: '' })); return }
    const complaint = complaints.find(c => c.id === id)
    if (!complaint) return
    setForm(f => ({
      ...f,
      complaint_id: id,
      customer_id: complaint.customer_id,
      priority: complaint.priority,
      job_description: complaint.description,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.customer_id) { setError('Please select a customer'); return }
    if (!form.job_description.trim()) { setError('Please enter a job description'); return }

    // Parse assigned_key → assigned_to (user UUID) + technician_name + assigned_staff_id
    const [pType, pId] = form.assigned_key ? form.assigned_key.split(':') : []
    const person = technicians.find(t => t.id === pId && t.type === pType)
    const assigned_to = pType === 'user' ? pId ?? null : null
    const assigned_staff_id = pType === 'staff' ? pId ?? null : null
    const technician_name = person?.full_name ?? null

    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: form.customer_id,
          complaint_id: form.complaint_id || null,
          assigned_to,
          assigned_staff_id,
          technician_name,
          service_category: form.service_category,
          priority: form.priority,
          job_description: form.job_description.trim(),
          notes: form.notes || null,
          estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
          estimated_amount: form.estimated_amount ? Number(form.estimated_amount) : null,
          scheduled_date: form.scheduled_date || null,
          scheduled_time: form.scheduled_time || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (prefill?.complaint_id) {
        window.location.href = `/complaints/${prefill.complaint_id}`
      } else {
        window.location.href = `/work-orders/${data.id}`
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create work order')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white'
  const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

  const systemUsers = technicians.filter(t => t.type === 'user')
  const staffMembers = technicians.filter(t => t.type === 'staff')

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Complaint linkage */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Linked Complaint</h2>
          <span className="text-xs text-slate-400">Selecting a complaint auto-fills the form</span>
        </div>
        <div className="relative">
          <select
            value={form.complaint_id}
            onChange={handleComplaintChange}
            className={inputClass + ' appearance-none pr-9'}
            disabled={!!prefill}
          >
            <option value="">No linked complaint — start fresh</option>
            {complaints.map(c => (
              <option key={c.id} value={c.id}>
                {c.complaint_number} — {c.description.slice(0, 50)}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        {prefill && (
          <p className="text-xs text-blue-600">Linked to {prefill.complaint_number} — cannot be changed here.</p>
        )}
      </div>

      {/* Customer */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-900">Customer <span className="text-red-500">*</span></h2>
        <CustomerCombobox
          customers={customers}
          value={form.customer_id}
          onChange={id => setForm(f => ({ ...f, customer_id: id }))}
        />
      </div>

      {/* Job Details */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-900">Job Details</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Service Category</label>
            <div className="relative">
              <select value={form.service_category} onChange={set('service_category')} className={inputClass + ' appearance-none pr-9'}>
                {SERVICE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Priority</label>
            <div className="relative">
              <select value={form.priority} onChange={set('priority')} className={inputClass + ' appearance-none pr-9'}>
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>
        <div>
          <label className={labelClass}>Job Description <span className="text-red-500">*</span></label>
          <textarea
            value={form.job_description}
            onChange={set('job_description')}
            rows={4}
            placeholder="Describe the work to be done…"
            className={inputClass + ' resize-none'}
          />
        </div>
        <div>
          <label className={labelClass}>Internal Notes <span className="text-slate-400 font-normal">(optional)</span></label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={2}
            placeholder="Notes visible only to staff…"
            className={inputClass + ' resize-none'}
          />
        </div>
      </div>

      {/* Scheduling & Assignment */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-900">Scheduling & Assignment</h2>
        <div>
          <label className={labelClass}>Assign Technician <span className="text-slate-400 font-normal">(optional)</span></label>
          <div className="relative">
            <select value={form.assigned_key} onChange={set('assigned_key')} className={inputClass + ' appearance-none pr-9'}>
              <option value="">Unassigned</option>
              {systemUsers.length > 0 && (
                <optgroup label="System Users (App access)">
                  {systemUsers.map(t => (
                    <option key={t.id} value={`user:${t.id}`}>
                      {t.full_name} — {t.role}
                    </option>
                  ))}
                </optgroup>
              )}
              {staffMembers.length > 0 && (
                <optgroup label="Staff Members">
                  {staffMembers.map(t => (
                    <option key={t.id} value={`staff:${t.id}`}>
                      {t.full_name}{t.role ? ` — ${t.role}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Scheduled Date</label>
            <input type="date" value={form.scheduled_date} onChange={set('scheduled_date')} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Scheduled Time</label>
            <input type="time" value={form.scheduled_time} onChange={set('scheduled_time')} className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Estimated Hours</label>
            <input type="number" min="0.5" step="0.5" value={form.estimated_hours} onChange={set('estimated_hours')} placeholder="e.g. 2.5" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Estimated Amount (KWD)</label>
            <input type="number" min="0" step="0.01" value={form.estimated_amount} onChange={set('estimated_amount')} placeholder="e.g. 500.00" className={inputClass} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pb-6">
        <button type="button" onClick={() => router.back()} className="px-5 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition">
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : 'Create Work Order'}
        </button>
      </div>
    </form>
  )
}
