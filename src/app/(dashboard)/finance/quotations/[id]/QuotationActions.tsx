'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, Loader2, RefreshCw, Send, XCircle } from 'lucide-react'

interface Props {
  quotationId: string
  currentStatus: string
}

const actions = [
  { status: 'sent', label: 'Mark Sent', icon: Send, className: 'bg-blue-600 hover:bg-blue-700 text-white' },
  { status: 'approved', label: 'Approved', icon: CheckCircle2, className: 'bg-green-600 hover:bg-green-700 text-white' },
  { status: 'rejected', label: 'Rejected', icon: XCircle, className: 'bg-red-600 hover:bg-red-700 text-white' },
  { status: 'expired', label: 'Expired', icon: Clock, className: 'bg-amber-600 hover:bg-amber-700 text-white' },
]

export function QuotationActions({ quotationId, currentStatus }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function updateStatus(status: string) {
    setLoading(status)
    setError('')
    try {
      const res = await fetch(`/api/quotations/${quotationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to update status')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setLoading(null)
    }
  }

  async function convertToInvoice() {
    setLoading('convert')
    setError('')
    try {
      const res = await fetch(`/api/quotations/${quotationId}/convert`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to convert quotation')
      router.push(`/finance/invoices/${data.invoice_id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert quotation')
      setLoading(null)
    }
  }

  const isConverted = currentStatus === 'converted'

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 print:hidden">
      <h3 className="font-semibold text-slate-900">Actions</h3>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</p>}
      {!isConverted && (
        <div className="grid grid-cols-2 gap-2">
          {actions.map(({ status, label, icon: Icon, className }) => (
            <button
              key={status}
              type="button"
              onClick={() => updateStatus(status)}
              disabled={loading !== null || currentStatus === status}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg disabled:opacity-50 transition ${className}`}
            >
              {loading === status ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
              {label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={convertToInvoice}
        disabled={loading !== null || isConverted || !['approved', 'sent', 'draft'].includes(currentStatus)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition"
      >
        {loading === 'convert' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        Convert to Invoice
      </button>
    </div>
  )
}
