'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

interface Invoice {
  id: string
  invoice_date: string
  due_date: string | null
  payment_type: string
  payment_mode: string | null
  payment_status: string
  notes: string | null
}

export function EditPurchaseInvoiceForm({ invoice }: { invoice: Invoice }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const body = {
      action: 'update',
      invoice_date: fd.get('invoice_date') as string,
      due_date: fd.get('due_date') as string || null,
      payment_type: fd.get('payment_type') as string,
      payment_mode: fd.get('payment_mode') as string || null,
      payment_status: fd.get('payment_status') as string,
      notes: fd.get('notes') as string || null,
    }
    const res = await fetch(`/api/purchase-invoices/${invoice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      setError('Failed to save. Please try again.')
      setLoading(false)
      return
    }
    router.push(`/inventory/purchase-invoices/${invoice.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div>
        <label className={labelClass}>Invoice Date</label>
        <input type="date" name="invoice_date" defaultValue={invoice.invoice_date} required className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Due Date <span className="text-slate-400 font-normal">(optional)</span></label>
        <input type="date" name="due_date" defaultValue={invoice.due_date ?? ''} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Payment Type</label>
        <select name="payment_type" defaultValue={invoice.payment_type} className={inputClass}>
          <option value="cash">Cash</option>
          <option value="credit">Credit</option>
        </select>
      </div>

      <div>
        <label className={labelClass}>Payment Mode <span className="text-slate-400 font-normal">(optional)</span></label>
        <select name="payment_mode" defaultValue={invoice.payment_mode ?? ''} className={inputClass}>
          <option value="">— None —</option>
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="cheque">Cheque</option>
          <option value="online">Online</option>
        </select>
      </div>

      <div>
        <label className={labelClass}>Payment Status</label>
        <select name="payment_status" defaultValue={invoice.payment_status} className={inputClass}>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      <div>
        <label className={labelClass}>Notes <span className="text-slate-400 font-normal">(optional)</span></label>
        <textarea name="notes" defaultValue={invoice.notes ?? ''} rows={3} className={inputClass} />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading}
          className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-60">
          {loading ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}
