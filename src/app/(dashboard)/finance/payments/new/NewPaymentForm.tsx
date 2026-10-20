'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Search, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { safeReturnTo } from '@/lib/backNav'
import { isValidMoney } from '@/lib/assets'
import { calculateInvoiceSettlement } from '@/lib/customerPayments'

interface Customer {
  id: string
  full_name: string
  mobile_number: string | null
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
  openInvoices: OpenInvoice[]
  prefilledCustomerId: string
  prefilledCustomerName: string
  prefilledInvoiceId: string
  prefilledAmount: string
  returnTo: string
}

const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'pos', label: 'POS' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online' },
  { value: 'knet', label: 'KNET' },
  { value: 'other', label: 'Other' },
]

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

export function NewPaymentForm({
  openInvoices,
  prefilledCustomerId,
  prefilledCustomerName,
  prefilledInvoiceId,
  prefilledAmount,
  returnTo,
}: Props) {
  const router = useRouter()
  const destination = safeReturnTo(returnTo) ?? '/finance/payments'
  const [customerId, setCustomerId] = useState(prefilledCustomerId)
  const [customerName, setCustomerName] = useState(prefilledCustomerName)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Customer[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [searching, setSearching] = useState(false)
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>(
    prefilledInvoiceId ? [prefilledInvoiceId] : [],
  )
  const [discountByInvoiceId, setDiscountByInvoiceId] = useState<Record<string, string>>({})
  const [isAdvance, setIsAdvance] = useState(false)
  const [paymentDate, setPaymentDate] = useState(TODAY)
  const [amountReceived, setAmountReceived] = useState(prefilledAmount)
  const [paymentMode, setPaymentMode] = useState('cash')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!searchQuery.trim()) return
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(searchQuery)}`)
        const data = await res.json()
        setSearchResults(data)
        setShowDropdown(true)
      } catch {
        // Search is advisory; submission remains unavailable until a customer is selected.
      } finally {
        setSearching(false)
      }
    }, 250)
  }, [searchQuery])

  const customerInvoices = customerId
    ? openInvoices.filter(inv => inv.customer_id === customerId)
    : openInvoices
  const selectedInvoices = customerInvoices.filter(inv => selectedInvoiceIds.includes(inv.id))
  const isSingleInvoice = selectedInvoices.length === 1
  const selectedSettlements = selectedInvoices.map(invoice => ({
    invoice,
    settlement: calculateInvoiceSettlement(
      invoice.balance_due,
      discountByInvoiceId[invoice.id] ?? '0',
      isSingleInvoice ? amountReceived : undefined,
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

  function clearDiscountsExcept(invoiceIds: string[]) {
    const allowed = new Set(invoiceIds)
    setDiscountByInvoiceId(current => Object.fromEntries(
      Object.entries(current).filter(([invoiceId]) => allowed.has(invoiceId)),
    ))
  }

  function updateAmountForSelection(invoiceIds: string[]) {
    if (invoiceIds.length === 1) {
      const invoice = customerInvoices.find(candidate => candidate.id === invoiceIds[0])
      const discount = discountByInvoiceId[invoiceIds[0]] ?? '0'
      const settlement = invoice
        ? calculateInvoiceSettlement(invoice.balance_due, discount)
        : null
      setAmountReceived(settlement?.success ? settlement.value.cash.toFixed(3) : '')
    } else {
      setAmountReceived('')
    }
  }

  function toggleInvoice(id: string) {
    const next = selectedInvoiceIds.includes(id)
      ? selectedInvoiceIds.filter(invoiceId => invoiceId !== id)
      : [...selectedInvoiceIds, id]
    setSelectedInvoiceIds(next)
    clearDiscountsExcept(next)
    updateAmountForSelection(next)
  }

  function selectAllInvoices() {
    const allSelected = selectedInvoiceIds.length === customerInvoices.length
    const next = allSelected ? [] : customerInvoices.map(invoice => invoice.id)
    setSelectedInvoiceIds(next)
    clearDiscountsExcept(next)
    updateAmountForSelection(next)
  }

  function selectCustomer(customer: Customer) {
    const nextSelectedIds = selectedInvoiceIds.filter(invoiceId => {
      const invoice = openInvoices.find(candidate => candidate.id === invoiceId)
      return invoice?.customer_id === customer.id
    })
    setCustomerId(customer.id)
    setCustomerName(customer.full_name)
    setSearchQuery('')
    setShowDropdown(false)
    setSelectedInvoiceIds(nextSelectedIds)
    clearDiscountsExcept(nextSelectedIds)
    if (nextSelectedIds.length === 1) {
      const invoice = openInvoices.find(candidate => candidate.id === nextSelectedIds[0])
      const discount = discountByInvoiceId[nextSelectedIds[0]] ?? '0'
      const settlement = invoice
        ? calculateInvoiceSettlement(invoice.balance_due, discount)
        : null
      setAmountReceived(settlement?.success ? settlement.value.cash.toFixed(3) : '')
    } else {
      setAmountReceived('')
    }
  }

  function clearCustomer() {
    setCustomerId('')
    setCustomerName('')
    setSelectedInvoiceIds([])
    setDiscountByInvoiceId({})
    setAmountReceived('')
  }

  function handleAdvanceToggle(checked: boolean) {
    setIsAdvance(checked)
    if (checked) {
      setSelectedInvoiceIds([])
      setDiscountByInvoiceId({})
      setAmountReceived('')
    }
  }

  function updateDiscount(invoiceId: string, value: string) {
    setDiscountByInvoiceId(current => ({ ...current, [invoiceId]: value }))
    if (selectedInvoiceIds.length === 1 && selectedInvoiceIds[0] === invoiceId) {
      const invoice = customerInvoices.find(candidate => candidate.id === invoiceId)
      const settlement = invoice
        ? calculateInvoiceSettlement(invoice.balance_due, value)
        : null
      if (settlement?.success) setAmountReceived(settlement.value.cash.toFixed(3))
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!customerId) {
      setError('Please select a customer')
      return
    }
    if (!paymentDate) {
      setError('Payment date is required')
      return
    }
    if (!paymentMode) {
      setError('Payment mode is required')
      return
    }
    if (!isAdvance && selectedInvoices.length !== selectedInvoiceIds.length) {
      setError('One or more selected invoices are no longer available')
      return
    }
    if (!isAdvance && selectedInvoices.length === 0) {
      setError('Please select at least one invoice or check "Advance Payment"')
      return
    }

    const invoiceRequests: Array<{
      invoice: OpenInvoice
      amountReceived: number
      discountAmount: number
    }> = []
    if (!isAdvance) {
      for (const invoice of selectedInvoices) {
        const settlement = calculateInvoiceSettlement(
          invoice.balance_due,
          discountByInvoiceId[invoice.id] ?? '0',
          selectedInvoices.length === 1 ? amountReceived : undefined,
        )
        if (!settlement.success) {
          setError(`${invoice.invoice_number}: ${settlement.error}`)
          return
        }
        invoiceRequests.push({
          invoice,
          amountReceived: settlement.value.cash,
          discountAmount: settlement.value.discount,
        })
      }
    } else if (!isValidMoney(amountReceived) || Number(amountReceived) <= 0) {
      setError('Amount must be greater than zero with up to three decimal places')
      return
    }

    setLoading(true)
    try {
      if (isAdvance) {
        const res = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: customerId,
            invoice_id: null,
            payment_date: paymentDate,
            amount_received: amountReceived,
            discount_amount: 0,
            payment_mode: paymentMode,
            reference_number: referenceNumber.trim() || null,
            notes: notes.trim() || null,
            is_advance: true,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to record payment')
      } else {
        // Each invoice intentionally gets its own immutable payment source row.
        for (const request of invoiceRequests) {
          const res = await fetch('/api/payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_id: customerId,
              invoice_id: request.invoice.id,
              payment_date: paymentDate,
              amount_received: request.amountReceived,
              discount_amount: request.discountAmount,
              payment_mode: paymentMode,
              reference_number: referenceNumber.trim() || null,
              notes: notes.trim() || null,
              is_advance: false,
            }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error ?? 'Failed to record payment')
        }
      }

      router.replace(destination)
      router.refresh()
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
          <div className="md:col-span-2">
            <label className={labelClass}>Customer *</label>
            {customerId ? (
              <div className="flex items-center gap-2 border border-blue-300 bg-blue-50 rounded-lg px-3 py-2.5">
                <span className="flex-1 text-sm font-semibold text-slate-900">{customerName}</span>
                <button type="button" onClick={clearCustomer} className="text-slate-400 hover:text-red-500 flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div ref={searchRef} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Type customer name or mobile to search…"
                  value={searchQuery}
                  onChange={event => {
                    const value = event.target.value
                    setSearchQuery(value)
                    if (!value.trim()) {
                      setSearchResults([])
                      setShowDropdown(false)
                    }
                  }}
                  onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                {searching && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Searching…</span>
                )}
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                    {searchResults.map(customer => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => selectCustomer(customer)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition flex items-center justify-between gap-2"
                      >
                        <span className="font-medium text-slate-900">{customer.full_name}</span>
                        <span className="text-xs text-slate-400 flex-shrink-0">{customer.mobile_number}</span>
                      </button>
                    ))}
                  </div>
                )}
                {showDropdown && searchResults.length === 0 && !searching && searchQuery.trim() && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm text-slate-400">
                    No customers found
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isAdvance}
                onChange={event => handleAdvanceToggle(event.target.checked)}
                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-700">
                Advance Payment
                <span className="ml-2 text-xs text-slate-400 font-normal">(no specific invoice — will be applied later)</span>
              </span>
            </label>
          </div>

          {!isAdvance && (
            <div className="md:col-span-2">
              <label className={labelClass}>Invoice{customerInvoices.length !== 1 ? 's' : ''} *</label>
              {customerInvoices.length === 0 ? (
                <div className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-400 bg-slate-50">
                  {customerId ? 'No open invoices for this customer' : 'Select a customer to see their invoices'}
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-96 overflow-y-auto">
                  <label className="flex items-center justify-between gap-3 px-3 py-2 text-sm cursor-pointer bg-slate-50 hover:bg-slate-100 sticky top-0 z-10">
                    <span className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={selectedInvoiceIds.length === customerInvoices.length && customerInvoices.length > 0}
                        onChange={selectAllInvoices}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Select All</span>
                    </span>
                    <span className="text-xs text-slate-400">{customerInvoices.length} invoice{customerInvoices.length !== 1 ? 's' : ''}</span>
                  </label>
                  {customerInvoices.map(invoice => {
                    const isSelected = selectedInvoiceIds.includes(invoice.id)
                    const settlement = calculateInvoiceSettlement(
                      invoice.balance_due,
                      discountByInvoiceId[invoice.id] ?? '0',
                      isSelected && selectedInvoices.length === 1 ? amountReceived : undefined,
                    )
                    return (
                      <div key={invoice.id} className={`px-3 py-2.5 text-sm ${isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50'}`}>
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
                              <span className="block text-xs text-slate-400">
                                Balance: {formatCurrency(invoice.balance_due)} / Total: {formatCurrency(invoice.total_amount)}
                              </span>
                            </span>
                          </span>
                          <span className="text-slate-700 font-semibold flex-shrink-0">{formatCurrency(invoice.balance_due)}</span>
                        </label>
                        {isSelected && (
                          <div className="grid grid-cols-2 gap-3 mt-3 ml-6 p-3 rounded-lg border border-blue-100 bg-white">
                            <div>
                              <label htmlFor={`discount-${invoice.id}`} className="block text-xs font-medium text-slate-600 mb-1">
                                Settlement Discount (KWD)
                              </label>
                              <input
                                id={`discount-${invoice.id}`}
                                type="text"
                                inputMode="decimal"
                                placeholder="0.000"
                                value={discountByInvoiceId[invoice.id] ?? ''}
                                onChange={event => updateDiscount(invoice.id, event.target.value)}
                                className="w-full border border-slate-200 rounded-md px-2.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              {!settlement.success && (
                                <p className="mt-1 text-xs text-red-600">{settlement.error}</p>
                              )}
                            </div>
                            <div>
                              <span className="block text-xs font-medium text-slate-600 mb-1">Cash Received</span>
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
                  {selectedInvoiceIds.length} invoices selected · Each will get a separate payment record
                </p>
              )}
            </div>
          )}

          <div>
            <label className={labelClass}>Payment Date *</label>
            <input type="date" className={inputClass} value={paymentDate} onChange={event => setPaymentDate(event.target.value)} required />
          </div>

          <div>
            <label className={labelClass}>Cash Received (KWD) *</label>
            <input
              type={isAdvance ? 'number' : 'text'}
              inputMode="decimal"
              min={isAdvance ? '0.001' : undefined}
              step={isAdvance ? '0.001' : undefined}
              placeholder="0.000"
              className={`${inputClass} ${!isAdvance && selectedInvoices.length !== 1 ? 'bg-slate-50' : ''}`}
              value={isAdvance || selectedInvoices.length === 1
                ? amountReceived
                : (selectedInvoices.length > 1 ? totalCash.toFixed(3) : '')}
              onChange={event => setAmountReceived(event.target.value)}
              readOnly={!isAdvance && selectedInvoices.length !== 1}
              required
            />
            {!isAdvance && selectedInvoices.length === 1 && (
              <p className="text-xs text-slate-400 mt-1">Edit for a partial payment; cash plus discount cannot exceed the balance</p>
            )}
            {!isAdvance && selectedInvoices.length > 1 && (
              <p className="text-xs text-slate-400 mt-1">Calculated from each invoice balance minus its discount</p>
            )}
          </div>

          <div>
            <label className={labelClass}>Payment Mode *</label>
            <select className={inputClass} value={paymentMode} onChange={event => setPaymentMode(event.target.value)} required>
              {PAYMENT_MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>Reference Number</label>
            <input
              type="text"
              placeholder="Cheque no., transfer ref., etc."
              className={inputClass}
              value={referenceNumber}
              onChange={event => setReferenceNumber(event.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Notes</label>
            <textarea
              className={`${inputClass} resize-none`}
              rows={3}
              placeholder="Optional notes…"
              value={notes}
              onChange={event => setNotes(event.target.value)}
            />
          </div>
        </div>
      </div>

      {((selectedInvoices.length > 0 && !isAdvance) || (isAdvance && amountReceived && Number(amountReceived) > 0)) && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-green-800">Payment Summary</p>
              {isAdvance ? (
                <p className="text-xs text-green-600 mt-0.5">Advance payment — no invoice linked</p>
              ) : selectedInvoices.length > 1 ? (
                <p className="text-xs text-green-600 mt-0.5">{selectedInvoices.length} invoices · {selectedInvoices.length} payment records</p>
              ) : (
                <p className="text-xs text-green-600 mt-0.5">For invoice {selectedInvoices[0].invoice_number}</p>
              )}
            </div>
            {isAdvance ? (
              <p className="text-2xl font-bold text-green-700">{formatCurrency(Number(amountReceived || 0))}</p>
            ) : (
              <dl className="min-w-52 space-y-1 text-sm">
                <div className="flex justify-between gap-5 text-green-700">
                  <dt>Cash received</dt>
                  <dd className="font-semibold">{formatCurrency(totalCash)}</dd>
                </div>
                <div className="flex justify-between gap-5 text-green-700">
                  <dt>Settlement discount</dt>
                  <dd className="font-semibold">{formatCurrency(totalDiscount)}</dd>
                </div>
                <div className="flex justify-between gap-5 border-t border-green-200 pt-1 text-green-800">
                  <dt className="font-semibold">Total settled</dt>
                  <dd className="font-bold">{formatCurrency(totalSettled)}</dd>
                </div>
              </dl>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pb-6">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Recording…' : selectedInvoices.length > 1 ? `Record Payment (${selectedInvoices.length})` : 'Record Payment'}
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
