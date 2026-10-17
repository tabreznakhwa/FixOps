'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import { safeReturnTo } from '@/lib/backNav'
import { SUPPLIER_PAYMENT_MODES } from '@/lib/supplierPayments'

interface Supplier {
  id: string
  supplier_name: string
  supplier_code: string
}

interface OpenInvoice {
  id: string
  invoice_number: string
  supplier_invoice_number: string | null
  supplier_id: string
  invoice_date: string
  balance_due: number
  total_amount: number
}

interface Props {
  suppliers: Supplier[]
  openInvoices: OpenInvoice[]
  defaultInvoiceId: string | null
  defaultSupplierId: string | null
  returnTo: string
}

const MODE_LABELS: Record<(typeof SUPPLIER_PAYMENT_MODES)[number], string> = {
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  cash: 'Cash',
  knet: 'KNET',
  pos: 'POS',
  online: 'Online',
  card: 'Card',
  other: 'Other',
}

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'
const KWD_RE = /^\d{1,9}(\.\d{1,3})?$/

export function VendorPaymentForm({
  suppliers,
  openInvoices,
  defaultInvoiceId,
  defaultSupplierId,
  returnTo,
}: Props) {
  const router = useRouter()
  const destination = safeReturnTo(returnTo) ?? '/suppliers/vendor-payments'
  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? '')
  const [invoiceId, setInvoiceId] = useState(defaultInvoiceId ?? '')
  const [amount, setAmount] = useState('')
  const [discount, setDiscount] = useState('')
  const [mode, setMode] = useState<(typeof SUPPLIER_PAYMENT_MODES)[number]>('bank_transfer')
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' }))
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const supplierInvoices = useMemo(
    () => supplierId ? openInvoices.filter((invoice) => invoice.supplier_id === supplierId) : [],
    [openInvoices, supplierId],
  )
  const selectedInvoice = supplierInvoices.find((invoice) => invoice.id === invoiceId) ?? null

  function settlementAmount(invoice: OpenInvoice | null, nextDiscount: string) {
    if (!invoice) return ''
    return Math.max(0, Number(invoice.balance_due) - Number(nextDiscount || 0)).toFixed(3)
  }

  function onSupplierChange(nextSupplierId: string) {
    const invoiceStillMatches = openInvoices.some(
      (invoice) => invoice.id === invoiceId && invoice.supplier_id === nextSupplierId,
    )
    setSupplierId(nextSupplierId)
    if (!invoiceStillMatches) {
      setInvoiceId('')
      setDiscount('')
      setAmount('')
    }
  }

  function onInvoiceChange(nextId: string) {
    const invoice = supplierInvoices.find((candidate) => candidate.id === nextId) ?? null
    setInvoiceId(nextId)
    setDiscount('')
    setAmount(settlementAmount(invoice, ''))
  }

  function onDiscountChange(nextDiscount: string) {
    setDiscount(nextDiscount)
    setAmount(settlementAmount(selectedInvoice, nextDiscount))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    const amountText = amount.trim()
    const discountText = discount.trim() || '0'
    if (!supplierId) { setError('Please select a supplier'); return }
    if (!selectedInvoice) {
      setError('Please select a purchase invoice; use Supplier Advances for unallocated payments')
      return
    }
    if (!KWD_RE.test(amountText)) {
      setError('Enter a cash amount with up to three decimal places')
      return
    }
    if (!KWD_RE.test(discountText)) {
      setError('Enter a discount with up to three decimal places')
      return
    }
    if (Number(amountText) + Number(discountText) <= 0) {
      setError('Cash paid or discount must be greater than zero')
      return
    }
    if (Number(amountText) + Number(discountText) > Number(selectedInvoice.balance_due) + 0.0001) {
      setError(`Payment plus discount cannot exceed ${formatCurrency(Number(selectedInvoice.balance_due))}`)
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/suppliers/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          purchase_invoice_id: invoiceId || null,
          payment_date: date,
          amount_paid: amountText,
          discount_amount: discountText,
          payment_mode: mode,
          reference_number: reference.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'Failed to record payment')
        return
      }
      router.replace(destination)
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div>
        <label className={labelClass}>Supplier <span className="text-red-500">*</span></label>
        <select
          value={supplierId}
          onChange={(event) => onSupplierChange(event.target.value)}
          required
          className={inputClass}
        >
          <option value="">— Select supplier —</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.supplier_name} ({supplier.supplier_code})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>
          Purchase Invoice <span className="text-red-500">*</span>
        </label>
        <select
          value={invoiceId}
          onChange={(event) => onInvoiceChange(event.target.value)}
          disabled={!supplierId}
          className={inputClass}
        >
          <option value="">— Select purchase invoice —</option>
          {supplierInvoices.map((invoice) => (
            <option key={invoice.id} value={invoice.id}>
              {invoice.invoice_number}{invoice.supplier_invoice_number ? ` · ${invoice.supplier_invoice_number}` : ''} · {formatCurrency(Number(invoice.balance_due))}
            </option>
          ))}
        </select>
        {selectedInvoice && (
          <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
            Outstanding balance: <strong>{formatCurrency(Number(selectedInvoice.balance_due))}</strong>
            {' · '}Invoice date: {new Date(`${selectedInvoice.invoice_date}T00:00:00`).toLocaleDateString('en-GB')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Payment Date <span className="text-red-500">*</span></label>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Amount Paid <span className="text-red-500">*</span></label>
          <input
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            min="0"
            step="0.001"
            required
            placeholder="0.000"
            className={`${inputClass} text-right font-semibold`}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>
          Settlement Discount <span className="text-slate-400 font-normal">(only for the selected invoice)</span>
        </label>
        <input
          type="number"
          value={discount}
          onChange={(event) => onDiscountChange(event.target.value)}
          min="0"
          step="0.001"
          placeholder="0.000"
          disabled={!selectedInvoice}
          className={`${inputClass} text-right disabled:bg-slate-100 disabled:text-slate-400`}
        />
        {selectedInvoice && Number(discount || 0) > 0 && (
          <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
            Settlement: {formatCurrency(Number(amount || 0))} cash + {formatCurrency(Number(discount || 0))} discount
          </p>
        )}
      </div>

      <div>
        <label className={labelClass}>Payment Mode <span className="text-red-500">*</span></label>
        <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} required className={inputClass}>
          {SUPPLIER_PAYMENT_MODES.map((paymentMode) => (
            <option key={paymentMode} value={paymentMode}>{MODE_LABELS[paymentMode]}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Reference / Cheque No.</label>
        <input
          type="text"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="e.g. CHQ-12345 or TXN-REF"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional remarks…"
          className={inputClass}
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Recording…' : 'Record Payment'}
        </button>
        <button
          type="button"
          onClick={() => router.replace(destination)}
          className="px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
