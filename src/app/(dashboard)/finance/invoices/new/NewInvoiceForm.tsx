'use client'

import { useState, useCallback } from 'react'
import { Plus, Trash2, AlertCircle } from 'lucide-react'

interface Customer {
  id: string
  full_name: string
  mobile_number: string | null
  company_name: string | null
}

interface WorkOrder {
  id: string
  work_order_number: string
  final_amount: number
  customer_id: string
}

interface LineItem {
  description: string
  quantity: string
  unit_price: string
  discount_percent: string
}

interface Props {
  customers: Customer[]
  workOrders: WorkOrder[]
}

const TODAY = new Date().toISOString().split('T')[0]

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

function fmt(n: number) {
  return `KWD ${n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
}

function emptyItem(): LineItem {
  return { description: '', quantity: '1', unit_price: '', discount_percent: '0' }
}

export function NewInvoiceForm({ customers, workOrders }: Props) {
  const [customerId, setCustomerId] = useState('')
  const [invoiceType, setInvoiceType] = useState('service')
  const [invoiceDate, setInvoiceDate] = useState(TODAY)
  const [dueDate, setDueDate] = useState('')
  const [workOrderId, setWorkOrderId] = useState('')
  const [items, setItems] = useState<LineItem[]>([emptyItem()])
  const [discountAmount, setDiscountAmount] = useState('0')
  const [notes, setNotes] = useState('')
  const [termsAndConditions, setTermsAndConditions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const filteredWorkOrders = customerId
    ? workOrders.filter((wo) => wo.customer_id === customerId)
    : workOrders

  const updateItem = useCallback(
    (index: number, field: keyof LineItem, value: string) => {
      setItems((prev) => {
        const next = [...prev]
        next[index] = { ...next[index], [field]: value }
        return next
      })
    },
    [],
  )

  const addItem = () => setItems((prev) => [...prev, emptyItem()])
  const removeItem = (index: number) => {
    if (items.length === 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotal = items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0
    const price = parseFloat(item.unit_price) || 0
    const disc = parseFloat(item.discount_percent) || 0
    return sum + qty * price * (1 - disc / 100)
  }, 0)

  const discount = parseFloat(discountAmount) || 0
  const totalAmount = Math.max(0, subtotal - discount)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!customerId) { setError('Please select a customer'); return }
    if (items.some((it) => !it.description.trim() || !it.unit_price)) {
      setError('All line items must have a description and unit price')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          invoice_type: invoiceType,
          invoice_date: invoiceDate,
          due_date: dueDate || null,
          work_order_id: workOrderId || null,
          items: items.map((it) => ({
            description: it.description.trim(),
            quantity: parseFloat(it.quantity) || 1,
            unit_price: parseFloat(it.unit_price) || 0,
            discount_percent: parseFloat(it.discount_percent) || 0,
            tax_percent: 0,
          })),
          discount_amount: discount,
          tax_rate: 0,
          notes: notes.trim() || null,
          terms_and_conditions: termsAndConditions.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create invoice')

      window.location.href = `/finance/invoices/${data.id}`
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Header fields */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        <h2 className="font-semibold text-slate-900">Invoice Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Customer *</label>
            <select
              className={inputClass}
              value={customerId}
              onChange={(e) => { setCustomerId(e.target.value); setWorkOrderId('') }}
              required
            >
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}{c.company_name ? ` — ${c.company_name}` : ''}{c.mobile_number ? ` · ${c.mobile_number}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Invoice Type *</label>
            <select className={inputClass} value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)}>
              <option value="service">Service</option>
              <option value="amc">AMC</option>
              <option value="parts">Parts</option>
              <option value="advance">Advance</option>
              <option value="credit_note">Credit Note</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Invoice Date *</label>
            <input type="date" className={inputClass} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
          </div>

          <div>
            <label className={labelClass}>Due Date</label>
            <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          {filteredWorkOrders.length > 0 && (
            <div className="md:col-span-2">
              <label className={labelClass}>Link Work Order (optional)</label>
              <select className={inputClass} value={workOrderId} onChange={(e) => setWorkOrderId(e.target.value)}>
                <option value="">No work order</option>
                {filteredWorkOrders.map((wo) => (
                  <option key={wo.id} value={wo.id}>
                    {wo.work_order_number} — KWD {wo.final_amount.toLocaleString('en-US', { minimumFractionDigits: 3 })}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-4">Line Items</h2>

        <div className="space-y-3">
          <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
            <div className="col-span-5">Description</div>
            <div className="col-span-1 text-right">Qty</div>
            <div className="col-span-2 text-right">Unit Price (KWD)</div>
            <div className="col-span-2 text-right">Disc %</div>
            <div className="col-span-1 text-right">Line Total</div>
            <div className="col-span-1" />
          </div>

          {items.map((item, index) => {
            const qty = parseFloat(item.quantity) || 0
            const price = parseFloat(item.unit_price) || 0
            const disc = parseFloat(item.discount_percent) || 0
            const lineTotal = qty * price * (1 - disc / 100)
            return (
              <div key={index} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-12 md:col-span-5">
                  <input
                    type="text"
                    placeholder="Description *"
                    className={inputClass}
                    value={item.description}
                    onChange={(e) => updateItem(index, 'description', e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-4 md:col-span-1">
                  <input
                    type="number"
                    placeholder="Qty"
                    min="0.01"
                    step="0.01"
                    className={`${inputClass} text-right`}
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-8 md:col-span-2">
                  <input
                    type="number"
                    placeholder="0.000"
                    min="0"
                    step="0.001"
                    className={`${inputClass} text-right`}
                    value={item.unit_price}
                    onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <input
                    type="number"
                    placeholder="0"
                    min="0"
                    max="100"
                    step="0.01"
                    className={`${inputClass} text-right`}
                    value={item.discount_percent}
                    onChange={(e) => updateItem(index, 'discount_percent', e.target.value)}
                  />
                </div>
                <div className="col-span-3 md:col-span-1 flex items-center justify-end">
                  <span className="text-sm font-semibold text-slate-700">
                    {fmt(lineTotal)}
                  </span>
                </div>
                <div className="col-span-1 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    disabled={items.length === 1}
                    className="text-slate-400 hover:text-red-500 transition disabled:opacity-30 disabled:cursor-not-allowed p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={addItem}
          className="mt-4 flex items-center gap-2 text-sm text-blue-600 font-semibold hover:text-blue-700 transition"
        >
          <Plus className="w-4 h-4" /> Add Line Item
        </button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">Adjustments</h2>
          <div>
            <label className={labelClass}>Header Discount (KWD)</label>
            <input
              type="number"
              min="0"
              step="0.001"
              className={inputClass}
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
            />
          </div>
          <p className="text-xs text-slate-400">No VAT applied — Kuwait exemption</p>
        </div>

        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Totals</h2>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-medium text-slate-900">{fmt(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Discount</span>
                <span className="font-medium text-green-700">− {fmt(discount)}</span>
              </div>
            )}
            <div className="border-t border-slate-200 pt-2.5 flex justify-between">
              <span className="font-bold text-slate-900 text-base">Total</span>
              <span className="font-bold text-blue-600 text-base">{fmt(totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes & Terms */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <label className={labelClass}>Notes</label>
          <textarea
            className={`${inputClass} resize-none`}
            rows={4}
            placeholder="Internal notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <label className={labelClass}>Terms & Conditions</label>
          <textarea
            className={`${inputClass} resize-none`}
            rows={4}
            placeholder="Payment terms, warranty, etc."
            value={termsAndConditions}
            onChange={(e) => setTermsAndConditions(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pb-6">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating…' : 'Create Invoice'}
        </button>
        <a
          href="/finance/invoices"
          className="px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
        >
          Cancel
        </a>
      </div>
    </form>
  )
}
