'use client'

import { useActionState, useState } from 'react'
import { updateWorkOrder } from '../../actions'
import Link from 'next/link'
import { Loader2, AlertCircle, ChevronDown } from 'lucide-react'

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

const PRIORITIES = ['low', 'medium', 'high', 'emergency'] as const

const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5'

interface WO {
  id: string; work_order_number: string; service_category: string | null;
  priority: string; job_description: string | null; notes: string | null;
  scheduled_date: string | null; scheduled_time: string | null;
  estimated_hours: number | null; estimated_amount: number | null; final_amount: number;
  assigned_to: string | null; assigned_staff_id: string | null; technician_name: string | null;
}

interface Person { id: string; full_name: string; type: 'user' | 'staff'; role: string }

interface Props {
  wo: WO
  technicians: Person[]
  currentAssigneeKey: string
}

export function EditWorkOrderForm({ wo, technicians, currentAssigneeKey }: Props) {
  const [state, action, pending] = useActionState(updateWorkOrder, null)
  const [assignedKey, setAssignedKey] = useState(currentAssigneeKey)

  const selectedTech = technicians.find(t => `${t.type}:${t.id}` === assignedKey)

  const systemUsers = technicians.filter(t => t.type === 'user')
  const staffMembers = technicians.filter(t => t.type === 'staff')

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="id" value={wo.id} />
      <input type="hidden" name="assigned_key" value={assignedKey} />
      <input type="hidden" name="technician_name" value={selectedTech?.full_name ?? ''} />

      {state?.error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {state.error}
        </div>
      )}

      {/* Job Details */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Job Details</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Service Category</label>
            <div className="relative">
              <select name="service_category" defaultValue={wo.service_category ?? ''} className={inputCls + ' appearance-none pr-9'}>
                {SERVICE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Priority</label>
            <div className="relative">
              <select name="priority" defaultValue={wo.priority} className={inputCls + ' appearance-none pr-9'}>
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>
        <div>
          <label className={labelCls}>Job Description <span className="text-red-500">*</span></label>
          <textarea
            name="job_description"
            required
            rows={4}
            defaultValue={wo.job_description ?? ''}
            className={inputCls + ' resize-none'}
          />
        </div>
        <div>
          <label className={labelCls}>Internal Notes</label>
          <textarea
            name="notes"
            rows={2}
            defaultValue={wo.notes ?? ''}
            className={inputCls + ' resize-none'}
          />
        </div>
      </div>

      {/* Scheduling & Assignment */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Scheduling & Assignment</h2>
        <div>
          <label className={labelCls}>Assign Technician</label>
          <div className="relative">
            <select
              value={assignedKey}
              onChange={e => setAssignedKey(e.target.value)}
              className={inputCls + ' appearance-none pr-9'}
            >
              <option value="">Unassigned</option>
              {systemUsers.length > 0 && (
                <optgroup label="System Users">
                  {systemUsers.map(t => (
                    <option key={t.id} value={`user:${t.id}`}>{t.full_name} — {t.role}</option>
                  ))}
                </optgroup>
              )}
              {staffMembers.length > 0 && (
                <optgroup label="Staff Members">
                  {staffMembers.map(t => (
                    <option key={t.id} value={`staff:${t.id}`}>{t.full_name}{t.role ? ` — ${t.role}` : ''}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Scheduled Date</label>
            <input type="date" name="scheduled_date" defaultValue={wo.scheduled_date ?? ''} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Scheduled Time</label>
            <input type="time" name="scheduled_time" defaultValue={wo.scheduled_time ?? ''} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Estimated Hours</label>
            <input type="number" name="estimated_hours" min="0.5" step="0.5"
              defaultValue={wo.estimated_hours ?? ''} placeholder="e.g. 2.5" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Estimated Amount (KWD)</label>
            <input type="number" name="estimated_amount" min="0" step="0.001"
              defaultValue={wo.estimated_amount ?? ''} placeholder="e.g. 50.000" className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Final Amount (KWD)</label>
          <input type="number" name="final_amount" min="0" step="0.001"
            defaultValue={wo.final_amount} placeholder="0.000" className={inputCls} />
        </div>
      </div>

      <div className="flex items-center gap-3 pb-6">
        <button type="submit" disabled={pending}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
          {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Changes'}
        </button>
        <Link href={`/work-orders/${wo.id}`}
          className="px-6 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">
          Cancel
        </Link>
      </div>
    </form>
  )
}
