'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import { safeReturnTo } from '@/lib/backNav'
import {
  calculateSupplierInvoiceSettlement,
  MAX_SUPPLIER_PAYMENT_SETTLEMENTS,
  SUPPLIER_PAYMENT_MODES,
} from '@/lib/supplierPayments'

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
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>(
    defaultInvoiceId ? [defaultInvoiceId] : [],
  )
  const [discountByInvoiceId, setDiscountByInvoiceId] = useState<Record<string, string>>({})
  const [amount, setAmount] = useState(() => {
    const invoice = defaultInvoiceId
      ? openInvoices.find((candidate) => candidate.id === defaultInvoiceId)
      : null
    return invoice ? Number(invoice.balance_due).toFixed(3) : ''
  })
  const [amountManuallyEdited, setAmountManuallyEdited] = useState(false)
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
  const selectedInvoices = supplierInvoices.filter((invoice) => selectedInvoiceIds.includes(invoice.id))
  const isSingleInvoice = selectedInvoices.length === 1
  const selectedSettlements = selectedInvoices.map((invoice) => ({
    invoice,
    settlement: calculateSupplierInvoiceSettlement(
      invoice.balance_due,
      discountByInvoiceId[invoice.id] ?? '0',
      isSingleInvoice ? amount : undefined,
    ),
  }))
  const totalCash = selectedSettlements.reduce(
    (sum, row) => sum + (row.settlement.success ? row.settlement.value.cash : 0),
    0,
  )
  const totalDiscount = selectedSettlements.reduce(
    (sum, row) => sum + (row.settlement.success ? row.settlement.value.discount : 0),
    0,
  )
  const totalSettled = totalCash + totalDiscount
  const allSelected = supplierInvoices.length > 0
    && selectedInvoiceIds.length === supplierInvoices.length

  function clearDiscountsExcept(invoiceIds: string[]) {
    const allowed = new Set(invoiceIds)
    setDiscountByInvoiceId((current) => Object.fromEntries(
      Object.entries(current).filter(([invoiceId]) => allowed.has(invoiceId)),
    ))
  }

  function suggestedCash(invoice: OpenInvoice | undefined, discount: string) {
    if (!invoice) return ''
    const settlement = calculateSupplierInvoiceSettlement(invoice.balance_due, discount)
    return settlement.success ? settlement.value.cash.toFixed(3) : ''
  }

  function updateAmountForSelection(invoiceIds: string[]) {
    setAmountManuallyEdited(false)
    if (invoiceIds.length === 1) {
      const invoice = supplierInvoices.find((candidate) => candidate.id === invoiceIds[0])
      setAmount(suggestedCash(invoice, discountByInvoiceId[invoiceIds[0]] ?? '0'))
    } else {
      setAmount('')
    }
  }

  function onSupplierChange(nextSupplierId: string) {
    const nextSelectedIds = selectedInvoiceIds.filter((invoiceId) => {
      const invoice = openInvoices.find((candidate) => candidate.id === invoiceId)
      return invoice?.supplier_id === nextSupplierId
    })
    setSupplierId(nextSupplierId)
    setSelectedInvoiceIds(nextSelectedIds)
    setAmountManuallyEdited(false)
    clearDiscountsExcept(nextSelectedIds)
    if (nextSelectedIds.length === 1) {
      const invoice = openInvoices.find((candidate) => candidate.id === nextSelectedIds[0])
      setAmount(suggestedCash(invoice, discountByInvoiceId[nextSelectedIds[0]] ?? '0'))
    } else {
      setAmount('')
    }
    setError('')
  }

  function toggleInvoice(invoiceId: string) {
    const next = selectedInvoiceIds.includes(invoiceId)
      ? selectedInvoiceIds.filter((id) => id !== invoiceId)
      : [...selectedInvoiceIds, invoiceId]
    setSelectedInvoiceIds(next)
    clearDiscountsExcept(next)
    updateAmountForSelection(next)
    setError('')
  }

  function selectAllInvoices() {
    const next = allSelected ? [] : supplierInvoices.map((invoice) => invoice.id)
    if (next.length > MAX_SUPPLIER_PAYMENT_SETTLEMENTS) {
      setError(`A vendor payment can settle at most ${MAX_SUPPLIER_PAYMENT_SETTLEMENTS} invoices`)
      return
    }
    setSelectedInvoiceIds(next)
    clearDiscountsExcept(next)
    updateAmountForSelection(next)
    setError('')
  }

  function updateDiscount(invoiceId: string, value: string) {
    setDiscountByInvoiceId((current) => ({ ...current, [invoiceId]: value }))
    if (
      !amountManuallyEdited
      && selectedInvoiceIds.length === 1
      && selectedInvoiceIds[0] === invoiceId
    ) {
      const invoice = supplierInvoices.find((candidate) => candidate.id === invoiceId)
      setAmount(suggestedCash(invoice, value))
    }
  }

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!supplierId) {
      setError('Please select a supplier')
      return
    }
    if (selectedInvoices.length !== selectedInvoiceIds.length) {
      setError('One or more selected invoices are no longer available')
      return
    }
    if (selectedInvoices.length === 0) {
      setError('Please select at least one purchase invoice')
      return
    }

    const settlements = []
    for (const invoice of selectedInvoices) {
      const settlement = calculateSupplierInvoiceSettlement(
        invoice.balance_due,
        discountByInvoiceId[invoice.id] ?? '0',
        selectedInvoices.length === 1 ? amount : undefined,
      )
      if (!settlement.success) {
        setError(`${invoice.invoice_number}: ${settlement.error}`)
        return
      }
      settlements.push({
        purchase_invoice_id: invoice.id,
        expected_balance_due: Number(invoice.balance_due).toFixed(3),
        amount_paid: settlement.value.cash.toFixed(3),
        discount_amount: settlement.value.discount.toFixed(3),
      })
    }

    setLoading(true)
    try {
      const response = await fetch('/api/suppliers/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          settlements,
          payment_date: date,
          payment_mode: mode,
          reference_number: reference.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      const data = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) {
        setError(data?.error ?? 'Failed to record payment')
        return
      }
      router.replace(destination)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

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
          Purchase invoices <span className="text-red-500">*</span>
        </label>
        {!supplierId ? (
          <div className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-400 bg-slate-50">
            Select a supplier to see open invoices
          </div>
        ) : supplierInvoices.length === 0 ? (
          <div className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-400 bg-slate-50">
            No open posted purchase invoices for this supplier
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-96 overflow-y-auto">
            <label className="flex items-center justify-between gap-3 px-3 py-2 text-sm cursor-pointer bg-slate-50 hover:bg-slate-100 sticky top-0 z-10">
              <span className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={selectAllInvoices}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs font-semibold text-slate-600">Select all</span>
              </span>
              <span className="text-xs text-slate-400">
                {supplierInvoices.length} invoice{supplierInvoices.length !== 1 ? 's' : ''}
              </span>
            </label>

            {supplierInvoices.map((invoice) => {
              const isSelected = selectedInvoiceIds.includes(invoice.id)
              const settlement = calculateSupplierInvoiceSettlement(
                invoice.balance_due,
                discountByInvoiceId[invoice.id] ?? '0',
                isSelected && selectedInvoices.length === 1 ? amount : undefined,
              )
              return (
                <div
                  key={invoice.id}
                  className={`px-3 py-2.5 text-sm ${isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50'}`}
                >
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <span className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleInvoice(invoice.id)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="min-w-0">
                        <span className="font-medium text-slate-900">{invoice.invoice_number}</span>
                        {invoice.supplier_invoice_number && (
                          <span className="text-xs text-slate-500 ml-1.5">({invoice.supplier_invoice_number})</span>
                        )}
                        <span className="block text-xs text-slate-400">
                          {new Date(`${invoice.invoice_date}T00:00:00`).toLocaleDateString('en-GB')}
                          {' · '}Total {formatCurrency(Number(invoice.total_amount))}
                        </span>
                      </span>
                    </span>
                    <span className="text-slate-700 font-semibold flex-shrink-0">
                      {formatCurrency(Number(invoice.balance_due))}
                    </span>
                  </label>

                  {isSelected && (
                    <div className="grid grid-cols-2 gap-3 mt-3 ml-6 p-3 rounded-lg border border-blue-100 bg-white">
                      <div>
                        <label htmlFor={`discount-${invoice.id}`} className="block text-xs font-medium text-slate-600 mb-1">
                          Settlement discount (KWD)
                        </label>
                        <input
                          id={`discount-${invoice.id}`}
                          type="text"
                          inputMode="decimal"
                          placeholder="0.000"
                          value={discountByInvoiceId[invoice.id] ?? ''}
                          onChange={(event) => updateDiscount(invoice.id, event.target.value)}
                          className="w-full border border-slate-200 rounded-md px-2.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {!settlement.success && (
                          <p className="mt-1 text-xs text-red-600">{settlement.error}</p>
                        )}
                      </div>
                      <div>
                        <span className="block text-xs font-medium text-slate-600 mb-1">Cash paid</span>
                        <div className="rounded-md bg-slate-50 px-2.5 py-2 font-semibold text-slate-900">
                          {settlement.success ? formatCurrency(settlement.value.cash) : '—'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {selectedInvoiceIds.length > 1 && (
          <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
            {selectedInvoiceIds.length} invoices selected · Each invoice will get its own payment record
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Payment date <span className="text-red-500">*</span></label>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Amount paid <span className="text-red-500">*</span></label>
          <input
            type="text"
            inputMode="decimal"
            value={selectedInvoices.length === 1
              ? amount
              : (selectedInvoices.length > 1 ? totalCash.toFixed(3) : '')}
            onChange={(event) => {
              setAmount(event.target.value)
              setAmountManuallyEdited(true)
            }}
            readOnly={selectedInvoices.length !== 1}
            required
            placeholder="0.000"
            className={`${inputClass} text-right font-semibold ${selectedInvoices.length !== 1 ? 'bg-slate-50' : ''}`}
          />
          {selectedInvoices.length === 1 && (
            <p className="text-xs text-slate-400 mt-1">Edit for a partial payment; cash plus discount cannot exceed the balance</p>
          )}
          {selectedInvoices.length > 1 && (
            <p className="text-xs text-slate-400 mt-1">Calculated from each invoice balance minus its discount</p>
          )}
        </div>
      </div>

      {selectedInvoices.length > 0 && (
        <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-right">
          <div>
            <p className="text-xs text-slate-500">Cash paid</p>
            <p className="text-sm font-semibold text-slate-900">{formatCurrency(totalCash)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Discount</p>
            <p className="text-sm font-semibold text-amber-700">{formatCurrency(totalDiscount)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Total settled</p>
            <p className="text-sm font-semibold text-blue-700">{formatCurrency(totalSettled)}</p>
          </div>
        </div>
      )}

      <div>
        <label className={labelClass}>Payment mode <span className="text-red-500">*</span></label>
        <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} required className={inputClass}>
          {SUPPLIER_PAYMENT_MODES.map((paymentMode) => (
            <option key={paymentMode} value={paymentMode}>{MODE_LABELS[paymentMode]}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Reference / cheque no.</label>
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
          disabled={loading || selectedInvoices.length === 0}
          className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Recording…' : `Record payment${selectedInvoices.length > 1 ? ` for ${selectedInvoices.length} invoices` : ''}`}
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
