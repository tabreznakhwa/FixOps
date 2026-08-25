'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

interface Supplier { id: string; supplier_name: string }

interface Invoice {
  id: string
  supplier_id: string | null
  supplier_name: string | null
  suppliers: { supplier_name: string } | null
  invoice_date: string
  due_date: string | null
  payment_type: string
  payment_mode: string | null
  payment_status: string
  notes: string | null
}

export function EditPurchaseInvoiceForm({ invoice, suppliers }: { invoice: Invoice; suppliers: Supplier[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedSupplierId, setSelectedSupplierId] = useState(invoice.supplier_id ?? '')

  const originalSupplierName = invoice.suppliers?.supplier_name ?? invoice.supplier_name ?? ''
  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId)
  const supplierChanged = selectedSupplierId && selectedSupplierId !== invoice.supplier_id

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const body: Record<string, unknown> = {
      action: 'update',
      invoice_date: fd.get('invoice_date') as string,
      due_date: fd.get('due_date') as string || null,
      payment_type: fd.get('payment_type') as string,
      payment_mode: fd.get('payment_mode') as string || null,
      payment_status: fd.get('payment_status') as string,
      notes: fd.get('notes') as string || null,
    }
    if (selectedSupplierId) {
      body.supplier_id = selectedSupplierId
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
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {/* Supplier */}
      <div>
        <label className={labelClass}>
          <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-slate-400" /> Supplier / Company</span>
        </label>
        <select
          value={selectedSupplierId}
          onChange={e => setSelectedSupplierId(e.target.value)}
          className={inputClass}
        >
          {!invoice.supplier_id && (
            <option value="">{originalSupplierName || '— Select supplier —'}</option>
          )}
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.supplier_name}</option>
          ))}
        </select>
        {supplierChanged && selectedSupplier && (
          <p className="mt-1.5 text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
            Changing from <strong>{originalSupplierName}</strong> → <strong>{selectedSupplier.supplier_name}</strong>. Add a note below explaining the correction.
          </p>
        )}
      </div>

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
          <option value="knet">KNET</option>
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
        <label className={labelClass}>
          Notes
          {supplierChanged && <span className="ml-1 text-amber-600 font-normal text-xs">(document the reason for correction)</span>}
        </label>
        <textarea
          name="notes"
          defaultValue={invoice.notes ?? ''}
          rows={3}
          placeholder={supplierChanged ? `e.g. Wrong branch selected — corrected from ${originalSupplierName} to ${selectedSupplier?.supplier_name ?? ''}` : 'Optional notes…'}
          className={inputClass}
        />
      </div>

      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={loading}
          className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-60">
          {loading ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}
