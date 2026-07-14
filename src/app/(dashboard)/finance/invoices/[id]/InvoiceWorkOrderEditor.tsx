'use client'

import { useState } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface WorkOrder {
  id: string
  work_order_number: string
}

interface Props {
  invoiceId: string
  workOrderId: string | null
  workOrderNumber: string | null
  availableWorkOrders: WorkOrder[]
}

export function InvoiceWorkOrderEditor({ invoiceId, workOrderId, workOrderNumber, availableWorkOrders }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(workOrderId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ work_order_id: draft || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Update failed')
      setEditing(false)
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setDraft(workOrderId ?? '')
    setEditing(false)
    setError('')
  }

  return (
    <div>
      <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Work Order</p>
      {editing ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <select
              value={draft}
              onChange={e => setDraft(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              autoFocus
            >
              <option value="">— No work order —</option>
              {availableWorkOrders.map(wo => (
                <option key={wo.id} value={wo.id}>{wo.work_order_number}</option>
              ))}
            </select>
            <button
              onClick={save}
              disabled={saving}
              className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={cancel}
              disabled={saving}
              className="p-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition disabled:opacity-60"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <p className={`font-semibold font-mono ${workOrderNumber ? 'text-slate-900' : 'text-slate-400 italic'}`}>
            {workOrderNumber ?? '—'}
          </p>
          <button
            onClick={() => setEditing(true)}
            className="p-0.5 text-slate-400 hover:text-blue-600 transition"
            title="Change linked work order"
          >
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}
