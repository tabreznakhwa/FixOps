'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ChevronDown } from 'lucide-react'

const STATUS_LABELS: Record<string, string> = {
  new: 'New', assigned: 'Assigned', work_started: 'Work Started',
  waiting_parts: 'Waiting Parts', completed: 'Completed',
  invoiced: 'Invoiced', paid: 'Paid', cancelled: 'Cancelled',
}

interface Person { id: string; full_name: string; type: 'user' | 'staff'; role: string }

interface Props {
  workOrderId: string
  currentStatus: string
  currentAssigneeKey: string | null  // "user:UUID" or "staff:UUID"
  technicians: Person[]
  statusFlow: string[]
}

export function WorkOrderActions({ workOrderId, currentStatus, currentAssigneeKey, technicians, statusFlow }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [assigneeKey, setAssigneeKey] = useState(currentAssigneeKey ?? '')

  const currentIdx = statusFlow.indexOf(currentStatus)
  const nextStatus = currentIdx < statusFlow.length - 1 ? statusFlow[currentIdx + 1] : null
  const prevStatus = currentIdx > 0 ? statusFlow[currentIdx - 1] : null

  const update = async (payload: Record<string, unknown>) => {
    const key = Object.keys(payload)[0]
    setLoading(key)
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Update failed')
      router.refresh()
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(null)
    }
  }

  const saveAssignment = () => {
    const [pType, pId] = assigneeKey ? assigneeKey.split(':') : []
    const person = technicians.find(t => t.id === pId && t.type === pType)
    update({
      assigned_to: pType === 'user' ? pId ?? null : null,
      assigned_staff_id: pType === 'staff' ? pId ?? null : null,
      technician_name: person?.full_name ?? null,
      status: person ? 'assigned' : currentStatus,
    })
  }

  const systemUsers = technicians.filter(t => t.type === 'user')
  const staffMembers = technicians.filter(t => t.type === 'staff')

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="font-semibold text-slate-900">Quick Actions</h2>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assign Technician</label>
        <div className="relative">
          <select
            value={assigneeKey}
            onChange={e => setAssigneeKey(e.target.value)}
            className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-8"
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
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <button
          onClick={saveAssignment}
          disabled={!!loading}
          className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg transition disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading === 'assigned_to' || loading === 'technician_name' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save Assignment
        </button>
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-2">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Move Status</label>
        {nextStatus && (
          <button
            onClick={() => update({ status: nextStatus })}
            disabled={!!loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading === 'status' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            → {STATUS_LABELS[nextStatus]}
          </button>
        )}
        {prevStatus && (
          <button
            onClick={() => update({ status: prevStatus })}
            disabled={!!loading}
            className="w-full py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition disabled:opacity-60"
          >
            ← Back to {STATUS_LABELS[prevStatus]}
          </button>
        )}
        {!['cancelled', 'paid'].includes(currentStatus) && (
          <button
            onClick={() => { if (confirm('Cancel this work order?')) update({ status: 'cancelled' }) }}
            disabled={!!loading}
            className="w-full py-2 text-red-500 hover:text-red-700 text-sm font-medium transition"
          >
            Cancel Work Order
          </button>
        )}
      </div>
    </div>
  )
}
