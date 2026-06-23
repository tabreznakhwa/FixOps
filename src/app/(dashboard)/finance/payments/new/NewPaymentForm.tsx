'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'

interface Customer {
  id: string
  full_name: string
  mobile_number: string
  company_name: string | null
}

interface OpenInvoice {
  id: string
  invoice_number: string
  total_amount: number
  balance_due: number
  customer_id: string
  status: string
}

interface Props {
  customers: Customer[]
  openInvoices: OpenInvoice[]
  prefilledCustomerId: string
  prefilledInvoiceId: string
  prefilledAmount: string
}

const TODAY = new Date().toISOString().split('T')[0]

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'pos', label: 'POS' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online' },
  { value: 'other', label: 'Other' },
]

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

export function NewPaymentForm({
  customers,
  openInvoices,
  prefilledCustomerId,
  prefilledInvoiceId,
  prefilledAmount,
}: Props) {
  const [customerId, setCustomerId] = useState(prefilledCustomerId)
  const [invoiceId, setInvoiceId] = useState(prefilledInvoiceId)
  const [isAdvance, setIsAdvance] = useState(false)
  const [paymentDate, setPaymentDate] = useState(TODAY)
  const [amountReceived, setAmountReceived] = useState(prefilledAmount)
  const [paymentMode, setPaymentMode] = useState('cash')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const customerInvoices = customerId
    ? openInvoices.filter((inv) => inv.customer_id === customerId)
    : openInvoices

  const selectedInvoice = invoiceId
    ? openInvoices.find((inv) => inv.id === invoiceId) ?? null
    : null

  const handleCustomerChange = (newCustomerId: string) => {
    setCustomerId(newCustomerId)
    // Only clear invoice if it doesn't belong to new customer
    if (invoiceId) {
      const inv = openInvoices.find((i) => i.id === invoiceId)
      if (inv && inv.customer_id !== newCustomerId) {
        setInvoiceId('')
        setAmountReceived('')
      }
    }
  }

  const handleInvoiceChange = (newInvoiceId: string) => {
    setInvoiceId(newInvoiceId)
    if (newInvoiceId) {
      const inv = openInvoices.find((i) => i.id === newInvoiceId)
      if (inv) {
        setAmountReceived(String(inv.balance_due))
        if (!customerId) setCustomerId(inv.customer_id)
      }
    }
  }

  const handleAdvanceToggle = (checked: boolean) => {
    setIsAdvance(checked)
    if (checked) {
      setInvoiceId('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!customerId) { setError('Please select a customer'); return }
    if (!paymentDate) { setError('Payment date is required'); return }
    const amount = parseFloat(amountReceived)
    if (!amountReceived || isNaN(amount) || amount <= 0) {
      setError('Amount must be greater than zero')
      return
    }
    if (!paymentMode) { setError('Payment mode is required'); return }
    if (!isAdvance && !invoiceId) {
      setError('Please select an invoice or check "Advance Payment"')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          invoice_id: isAdvance ? null : (invoiceId || null),
          payment_date: paymentDate,
          amount_received: amount,
          payment_mode: paymentMode,
          reference_number: referenceNumber.trim() || null,
          notes: notes.trim() || null,
          is_advance: isAdvance,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to record payment')

      window.location.href = '/finance/payments'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        <h2 className="font-semibold text-slate-900">Payment Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Customer */}
          <div className="md:col-span-2">
            <label className={labelClass}>Customer *</label>
            <select
              className={inputClass}
              value={customerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              required
            >
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                  {c.company_name ? ` — ${c.company_name}` : ''} · {c.mobile_number}
                </option>
              ))}
            </select>
          </div>

          {/* Advance Payment toggle */}
          <div className="md:col-span-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isAdvance}
                onChange={(e) => handleAdvanceToggle(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-700">
                Advance Payment
                <span className="ml-2 text-xs text-slate-400 font-normal">
                  (no specific invoice — will be applied later)
                </span>
              </span>
            </label>
          </div>

          {/* Invoice selection — hide when advance */}
          {!isAdvance && (
            <div className="md:col-span-2">
              <label className={labelClass}>Invoice *</label>
              {customerInvoices.length === 0 ? (
                <div className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-400 bg-slate-50">
                  {customerId
                    ? 'No open invoices for this customer'
                    : 'Select a customer to see their invoices'}
                </div>
              ) : (
                <select
                  className={inputClass}
                  value={invoiceId}
                  onChange={(e) => handleInvoiceChange(e.target.value)}
                  required={!isAdvance}
                >
                  <option value="">Select invoice…</option>
                  {customerInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number} — Balance: AED{' '}
                      {inv.balance_due.toLocaleString('en-AE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      / Total: AED{' '}
                      {inv.total_amount.toLocaleString('en-AE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </option>
                  ))}
                </select>
              )}
              {selectedInvoice && (
                <p className="text-xs text-slate-500 mt-1.5">
                  Status:{' '}
                  <span className="font-semibold capitalize">{selectedInvoice.status}</span>
                  {' '}· Balance due:{' '}
                  <span className="font-semibold text-amber-600">
                    AED{' '}
                    {selectedInvoice.balance_due.toLocaleString('en-AE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Payment Date */}
          <div>
            <label className={labelClass}>Payment Date *</label>
            <input
              type="date"
              className={inputClass}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
            />
          </div>

          {/* Amount */}
          <div>
            <label className={labelClass}>Amount (AED) *</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className={inputClass}
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value)}
              required
            />
          </div>

          {/* Payment Mode */}
          <div>
            <label className={labelClass}>Payment Mode *</label>
            <select
              className={inputClass}
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              required
            >
              {PAYMENT_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reference Number */}
          <div>
            <label className={labelClass}>Reference Number</label>
            <input
              type="text"
              placeholder="Cheque no., transfer ref., etc."
              className={inputClass}
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="md:col-span-2">
            <label className={labelClass}>Notes</label>
            <textarea
              className={`${inputClass} resize-none`}
              rows={3}
              placeholder="Optional notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Summary box */}
      {amountReceived && parseFloat(amountReceived) > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-green-800">Payment Summary</p>
              {isAdvance ? (
                <p className="text-xs text-green-600 mt-0.5">Advance payment — no invoice linked</p>
              ) : selectedInvoice ? (
                <p className="text-xs text-green-600 mt-0.5">
                  For invoice {selectedInvoice.invoice_number}
                </p>
              ) : null}
            </div>
            <p className="text-2xl font-bold text-green-700">
              AED{' '}
              {parseFloat(amountReceived || '0').toLocaleString('en-AE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pb-6">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Recording…' : 'Record Payment'}
        </button>
        <a
          href="/finance/payments"
          className="px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
        >
          Cancel
        </a>
      </div>
    </form>
  )
}
