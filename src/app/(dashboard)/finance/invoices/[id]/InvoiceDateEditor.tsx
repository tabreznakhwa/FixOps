'use client'

import { useState } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  invoiceId: string
  field: 'invoice_date' | 'due_date'
  label: string
  value: string | null
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function InvoiceDateEditor({ invoiceId, field, label, value }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: draft || null }),
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
    setDraft(value ?? '')
    setEditing(false)
    setError('')
  }

  return (
    <div>
      <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">{label}</p>
      {editing ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              autoFocus
            />
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
        <div className="flex items-center gap-2 group">
          <p className={`font-semibold ${field === 'due_date' && !value ? 'text-slate-400 italic' : 'text-slate-900'}`}>
            {value ? fmt(value) : '—'}
          </p>
          <button
            onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 transition p-0.5 text-slate-400 hover:text-blue-600"
            title={`Edit ${label}`}
          >
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}
