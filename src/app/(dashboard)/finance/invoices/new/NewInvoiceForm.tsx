'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Plus, Trash2, AlertCircle, ChevronDown, X } from 'lucide-react'

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

interface InventoryItem {
  id: string
  item_code: string
  item_name: string
  selling_price: number
  unit_of_measure: string
  current_stock: number
  category: string | null
}

type LineType = 'custom' | 'inventory' | 'service'

interface LineItem {
  type: LineType
  inventory_item_id: string
  service_label: string
  description: string
  quantity: string
  unit_price: string
}

interface Props {
  customers: Customer[]
  workOrders: WorkOrder[]
  inventoryItems: InventoryItem[]
}

const PRESET_SERVICES = [
  {
    group: '❄️ AC Services',
    items: [
      { label: 'Filter Cleaning', price: 5 },
      { label: 'Gas Top-up (R22)', price: 15 },
      { label: 'Gas Top-up (R32 / R410A)', price: 20 },
      { label: 'Drain Block Removal', price: 10 },
      { label: 'AC Full Service (Clean + Check)', price: 25 },
      { label: 'Split AC Installation', price: 40 },
      { label: 'Cassette / Ceiling AC Installation', price: 60 },
      { label: 'AC Uninstallation', price: 20 },
      { label: 'Thermostat Replacement', price: 15 },
      { label: 'Capacitor Replacement', price: 12 },
      { label: 'Fan Motor Replacement', price: 35 },
      { label: 'Compressor Diagnostic', price: 10 },
      { label: 'PCB / Control Board Repair', price: 30 },
      { label: 'Remote Control Replacement', price: 8 },
      { label: 'Gas Leak Detection', price: 15 },
      { label: 'Duct Cleaning (per unit)', price: 20 },
      { label: 'Annual AC Maintenance Contract', price: 60 },
    ],
  },
  {
    group: '🔧 Plumbing',
    items: [
      { label: 'Leak Detection & Repair', price: 10 },
      { label: 'Pipe Replacement', price: 20 },
      { label: 'Tap / Faucet Replacement', price: 15 },
      { label: 'Toilet Repair / Flush Fix', price: 15 },
      { label: 'Water Heater Installation', price: 25 },
      { label: 'Drain Unblocking / Cleaning', price: 10 },
      { label: 'Kitchen Sink Repair', price: 12 },
      { label: 'Shower Mixer Replacement', price: 20 },
      { label: 'Water Tank Cleaning', price: 30 },
    ],
  },
  {
    group: '⚡ Electrical',
    items: [
      { label: 'Wiring Repair', price: 15 },
      { label: 'Switch / Socket Replacement', price: 8 },
      { label: 'MCB / Breaker Replacement', price: 12 },
      { label: 'Light Fixture Installation', price: 8 },
      { label: 'Ceiling Fan Installation', price: 15 },
      { label: 'DB Panel Inspection', price: 10 },
      { label: 'Earth Leakage / RCD Testing', price: 12 },
      { label: 'Cable Pulling & Trunking', price: 20 },
    ],
  },
  {
    group: '🔨 General',
    items: [
      { label: 'Inspection / Site Visit', price: 5 },
      { label: 'Labour Charge (per hour)', price: 10 },
      { label: 'Transportation / Call-out Fee', price: 3 },
      { label: 'Emergency Call-out Surcharge', price: 15 },
      { label: 'Annual Maintenance Contract (AMC)', price: 50 },
      { label: 'Warranty Repair', price: 0 },
    ],
  },
]

const ALL_SERVICES = PRESET_SERVICES.flatMap(g => g.items)

const TODAY = new Date().toISOString().split('T')[0]

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

function CustomerCombobox({
  customers,
  value,
  onChange,
}: {
  customers: Customer[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const selected = customers.find((c) => c.id === value)

  const filtered = search.trim()
    ? customers.filter(
        (c) =>
          c.full_name.toLowerCase().includes(search.toLowerCase()) ||
          (c.company_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (c.mobile_number ?? '').includes(search),
      )
    : customers

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (id: string) => {
    onChange(id)
    setOpen(false)
    setSearch('')
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
      >
        {selected ? (
          <span className="text-slate-900 truncate">
            {selected.full_name}
            {selected.company_name ? ` — ${selected.company_name}` : ''}
            {selected.mobile_number ? (
              <span className="text-slate-400 ml-1">· {selected.mobile_number}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-slate-400">Select customer…</span>
        )}
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); select('') }}
              onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), select(''))}
              className="p-0.5 text-slate-400 hover:text-red-400 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              type="text"
              placeholder="Search name, company, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm text-slate-900 placeholder-slate-400 px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-400 px-3 py-3 text-center">No customers found</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => select(c.id)}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 transition flex items-center justify-between gap-2 ${value === c.id ? 'bg-blue-50 font-semibold' : ''}`}
                >
                  <span className="text-slate-900 truncate">
                    {c.full_name}
                    {c.company_name ? (
                      <span className="text-slate-400 font-normal"> — {c.company_name}</span>
                    ) : null}
                  </span>
                  {c.mobile_number && (
                    <span className="text-xs text-slate-400 flex-shrink-0">{c.mobile_number}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function fmt(n: number) {
  return `KWD ${n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
}

function emptyItem(): LineItem {
  return {
    type: 'custom',
    inventory_item_id: '',
    service_label: '',
    description: '',
    quantity: '1',
    unit_price: '',
  }
}

export function NewInvoiceForm({ customers, workOrders, inventoryItems }: Props) {
  const [customerId, setCustomerId] = useState('')
  const [invoiceType, setInvoiceType] = useState('service')
  const [invoiceDate, setInvoiceDate] = useState(TODAY)
  const [dueDate, setDueDate] = useState('')
  const [workOrderId, setWorkOrderId] = useState('')
  const [refNumber, setRefNumber] = useState('')
  const [items, setItems] = useState<LineItem[]>([emptyItem()])
  const [discountAmount, setDiscountAmount] = useState('0')
  const [notes, setNotes] = useState('')
  const [termsAndConditions, setTermsAndConditions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const filteredWorkOrders = customerId
    ? workOrders.filter((wo) => wo.customer_id === customerId)
    : workOrders

  // Group inventory by category for optgroups
  const invByCategory = useMemo(() => {
    const map: Record<string, InventoryItem[]> = {}
    for (const inv of inventoryItems) {
      const cat = inv.category ?? 'Other'
      if (!map[cat]) map[cat] = []
      map[cat].push(inv)
    }
    return map
  }, [inventoryItems])

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

  const switchItemType = useCallback((index: number, type: LineType) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        type,
        inventory_item_id: '',
        service_label: '',
        description: '',
        unit_price: '',
      }
      return next
    })
  }, [])

  const selectInventoryItem = useCallback((index: number, itemId: string) => {
    if (!itemId) {
      setItems((prev) => {
        const next = [...prev]
        next[index] = { ...next[index], inventory_item_id: '', description: '', unit_price: '' }
        return next
      })
      return
    }
    const inv = inventoryItems.find((i) => i.id === itemId)
    if (!inv) return
    setItems((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        inventory_item_id: itemId,
        description: inv.item_name,
        unit_price: inv.selling_price > 0 ? String(inv.selling_price) : '',
      }
      return next
    })
  }, [inventoryItems])

  const selectService = useCallback((index: number, label: string) => {
    if (!label) {
      setItems((prev) => {
        const next = [...prev]
        next[index] = { ...next[index], service_label: '', description: '', unit_price: '' }
        return next
      })
      return
    }
    const svc = ALL_SERVICES.find((s) => s.label === label)
    if (!svc) return
    setItems((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        service_label: label,
        description: label,
        unit_price: svc.price > 0 ? String(svc.price) : '',
      }
      return next
    })
  }, [])

  const addItem = () => setItems((prev) => [...prev, emptyItem()])
  const removeItem = (index: number) => {
    if (items.length === 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotal = items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0
    const price = parseFloat(item.unit_price) || 0
    return sum + qty * price
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
            discount_percent: 0,
            tax_percent: 0,
            inventory_item_id: it.inventory_item_id || null,
          })),
          ref_number: refNumber.trim() || null,
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
            <CustomerCombobox
              customers={customers}
              value={customerId}
              onChange={(id) => { setCustomerId(id); setWorkOrderId('') }}
            />
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

          <div className="md:col-span-2">
            <label className={labelClass}>REF Number <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. PO-2026-001, WO-REF-123…"
              className={inputClass}
              value={refNumber}
              onChange={(e) => setRefNumber(e.target.value)}
            />
          </div>

          {filteredWorkOrders.length > 0 && (
            <div className="md:col-span-2">
              <label className={labelClass}>Link Work Order (optional)</label>
              <select
                className={inputClass}
                value={workOrderId}
                onChange={(e) => {
                  const id = e.target.value
                  setWorkOrderId(id)
                  if (id) {
                    const wo = workOrders.find((w) => w.id === id)
                    if (wo) setCustomerId(wo.customer_id)
                  }
                }}
              >
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
          {/* Column headers — desktop only */}
          <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
            <div className="col-span-7">Description</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2 text-right">Unit Price (KWD)</div>
            <div className="col-span-1 text-right">Total</div>
          </div>

          {items.map((item, index) => {
            const qty = parseFloat(item.quantity) || 0
            const price = parseFloat(item.unit_price) || 0
            const lineTotal = qty * price

            return (
              <div key={index} className="border border-slate-200 rounded-xl p-3 space-y-2.5 bg-slate-50">
                {/* Type toggle + delete */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden text-xs font-semibold divide-x divide-slate-200">
                    {(['custom', 'inventory', 'service'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => switchItemType(index, t)}
                        className={`px-3 py-1.5 transition-colors ${
                          item.type === t
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {t === 'custom' ? '✏️ Custom' : t === 'inventory' ? '📦 Part' : '🔧 Service'}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    disabled={items.length === 1}
                    className="text-slate-400 hover:text-red-500 transition disabled:opacity-30 disabled:cursor-not-allowed p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Part picker */}
                {item.type === 'inventory' && (
                  <select
                    value={item.inventory_item_id}
                    onChange={(e) => selectInventoryItem(index, e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select part from inventory…</option>
                    {Object.entries(invByCategory).sort(([a], [b]) => a.localeCompare(b)).map(([cat, catItems]) => (
                      <optgroup key={cat} label={cat}>
                        {catItems.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.item_name} — KWD {inv.selling_price.toFixed(3)} (Stock: {inv.current_stock} {inv.unit_of_measure})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )}

                {/* Service picker */}
                {item.type === 'service' && (
                  <select
                    value={item.service_label}
                    onChange={(e) => selectService(index, e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select service…</option>
                    {PRESET_SERVICES.map((group) => (
                      <optgroup key={group.group} label={group.group}>
                        {group.items.map((svc) => (
                          <option key={svc.label} value={svc.label}>
                            {svc.label}{svc.price > 0 ? ` — KWD ${svc.price.toFixed(3)}` : ' — Free / Custom price'}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )}

                {/* Description + price fields */}
                <div className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-12 md:col-span-7">
                    <input
                      type="text"
                      placeholder={item.type === 'custom' ? 'Description *' : 'Description (auto-filled, editable)'}
                      className={inputClass}
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
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
                  <div className="col-span-5 md:col-span-2">
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
                  <div className="col-span-3 md:col-span-1 flex items-center justify-end">
                    <span className="text-sm font-semibold text-slate-700">{fmt(lineTotal)}</span>
                  </div>
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
          <h2 className="font-semibold text-slate-900">Discount</h2>
          <div>
            <label className={labelClass}>Discount Amount (KWD)</label>
            <input
              type="number"
              min="0"
              step="0.001"
              className={inputClass}
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
            />
          </div>
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
