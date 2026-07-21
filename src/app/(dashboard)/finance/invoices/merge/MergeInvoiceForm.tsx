'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search, CheckSquare, Square, AlertCircle } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Customer {
  id: string
  full_name: string
  mobile_number: string | null
  company_name: string | null
}

interface Invoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string | null
  total_amount: number
  balance_due: number
  status: string
}

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

export function MergeInvoiceForm({ customers }: { customers: Customer[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Customer selector
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  // Invoices for selected customer
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Form fields
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })
  const [invoiceDate, setInvoiceDate] = useState(today)
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [refNumber, setRefNumber] = useState('')
  const [discountAmount, setDiscountAmount] = useState('')

  const filteredCustomers = customers.filter((c) => {
    const q = customerSearch.toLowerCase()
    return (
      c.full_name.toLowerCase().includes(q) ||
      (c.mobile_number ?? '').includes(q) ||
      (c.company_name ?? '').toLowerCase().includes(q)
    )
  }).slice(0, 10)

  async function loadInvoices(customerId: string) {
    setInvoicesLoading(true)
    setInvoices([])
    setSelectedIds(new Set())
    try {
      const res = await fetch(`/api/invoices?customer_id=${customerId}&status_not=paid,cancelled`)
      if (res.ok) {
        const data = await res.json()
        setInvoices(data.invoices ?? [])
      }
    } catch {
      // ignore — show empty list
    } finally {
      setInvoicesLoading(false)
    }
  }

  function selectCustomer(c: Customer) {
    setSelectedCustomer(c)
    setCustomerSearch(c.full_name)
    setShowDropdown(false)
    setSelectedIds(new Set())
    loadInvoices(c.id)
  }

  function toggleInvoice(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === invoices.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(invoices.map(i => i.id)))
    }
  }

  const selectedInvoices = invoices.filter(i => selectedIds.has(i.id))
  const mergedTotal = selectedInvoices.reduce((s, i) => s + i.total_amount, 0)
  const discountNum = Math.max(0, parseFloat(discountAmount) || 0)
  const netTotal = Math.max(0, mergedTotal - discountNum)

  async function handleSubmit() {
    if (!selectedCustomer) { setError('Please select a customer'); return }
    if (selectedIds.size < 2) { setError('Select at least 2 invoices to merge'); return }
    if (!invoiceDate) { setError('Invoice date is required'); return }

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/invoices/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_ids: [...selectedIds],
          invoice_date: invoiceDate,
          due_date: dueDate || null,
          notes: notes || null,
          ref_number: refNumber || null,
          discount_amount: discountNum,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to merge invoices'); setLoading(false); return }
      setSuccess(`Invoice ${data.invoice_number} created successfully. Source invoices have been cancelled.`)
      setTimeout(() => router.push(`/finance/invoices/${data.id}`), 1500)
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
          {success}
        </div>
      )}

      {/* Step 1: Select Customer */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-900">Step 1 — Select Customer</h2>
        <div className="relative">
          <label className={labelClass}>Customer</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={customerSearch}
              onChange={(e) => { setCustomerSearch(e.target.value); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Search by name, phone, or company…"
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          {showDropdown && customerSearch.length > 0 && filteredCustomers.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden max-h-64 overflow-y-auto">
              {filteredCustomers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectCustomer(c)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                >
                  <p className="text-sm font-semibold text-slate-900">{c.full_name}</p>
                  <p className="text-xs text-slate-500">
                    {[c.company_name, c.mobile_number ?? '—'].filter(Boolean).join(' · ')}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Select Invoices */}
      {selectedCustomer && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="font-semibold text-slate-900">Step 2 — Select Invoices to Merge</h2>
          <p className="text-sm text-slate-500">
            Showing unpaid invoices for <span className="font-semibold text-slate-700">{selectedCustomer.full_name}</span>.
            Merged invoice will replace these (originals will be cancelled).
          </p>

          {invoicesLoading ? (
            <div className="flex items-center gap-2 py-6 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading invoices…</span>
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">
              No unpaid invoices found for this customer.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 w-10">
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="text-slate-400 hover:text-blue-600 transition-colors"
                        title="Select all"
                      >
                        {selectedIds.size === invoices.length
                          ? <CheckSquare className="w-4 h-4 text-blue-600" />
                          : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">Invoice</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">Date</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">Amount</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className={`cursor-pointer transition-colors ${selectedIds.has(inv.id) ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                      onClick={() => toggleInvoice(inv.id)}
                    >
                      <td className="px-4 py-3 text-center">
                        {selectedIds.has(inv.id)
                          ? <CheckSquare className="w-4 h-4 text-blue-600 mx-auto" />
                          : <Square className="w-4 h-4 text-slate-300 mx-auto" />}
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-sm font-mono font-semibold text-slate-900">{inv.invoice_number}</p>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-600">{formatDate(inv.invoice_date)}</td>
                      <td className="px-3 py-3 text-right text-sm font-semibold text-slate-900">{formatCurrency(inv.total_amount)}</td>
                      <td className="px-3 py-3">
                        <span className="text-xs font-semibold capitalize text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedIds.size >= 2 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-blue-700 font-semibold">{selectedIds.size} invoices selected</span>
              <span className="text-sm font-bold text-blue-900">Merged total: {formatCurrency(mergedTotal)}</span>
            </div>
          )}
        </div>
      )}

      {/* Step 3: New Invoice Details */}
      {selectedIds.size >= 2 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="font-semibold text-slate-900">Step 3 — Consolidated Invoice Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Invoice Date <span className="text-red-500">*</span></label>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Due Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>REF Number</label>
              <input type="text" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} placeholder="Optional reference" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Discount (KWD)</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                placeholder="0.000"
                className={inputClass}
              />
            </div>
          </div>

          {/* Total summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal ({selectedIds.size} invoices)</span>
              <span className="font-semibold">{formatCurrency(mergedTotal)}</span>
            </div>
            {discountNum > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Discount</span>
                <span className="font-semibold">− {formatCurrency(discountNum)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1.5 mt-1">
              <span>Net Total</span>
              <span>{formatCurrency(netTotal)}</span>
            </div>
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes for the consolidated invoice…"
              className={inputClass + ' resize-none'}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-slate-500">
              Creates <span className="font-semibold text-slate-900">1 consolidated invoice</span> and cancels the {selectedIds.size} source invoices.
            </p>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Generate Consolidated Invoice
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
