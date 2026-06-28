'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Search, ChevronDown, X, AlertCircle, Loader2, Package } from 'lucide-react'

interface Supplier { id: string; supplier_name: string; supplier_code: string }
interface InvItem {
  id: string; item_code: string; item_name: string; category: string | null
  unit_of_measure: string; current_stock: number; purchase_price: number
}

interface LineItem {
  inventory_item_id: string
  description: string
  unit_of_measure: string
  quantity: string
  unit_cost: string
}

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5'
const TODAY = new Date().toISOString().split('T')[0]

function emptyLine(): LineItem {
  return { inventory_item_id: '', description: '', unit_of_measure: '', quantity: '1', unit_cost: '' }
}

// ── Inventory Item Combobox ────────────────────────────────
function ItemCombobox({
  items, value, onChange,
}: {
  items: InvItem[]
  value: string
  onChange: (item: InvItem | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const selected = items.find(i => i.id === value)

  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOut)
    return () => document.removeEventListener('mousedown', onClickOut)
  }, [])

  const filtered = query
    ? items.filter(i =>
        i.item_name.toLowerCase().includes(query.toLowerCase()) ||
        i.item_code.toLowerCase().includes(query.toLowerCase()) ||
        (i.category ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : items

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery('') }}
        className="w-full flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-left"
      >
        {selected ? (
          <div className="flex-1 min-w-0">
            <span className="font-medium text-slate-900">{selected.item_name}</span>
            <span className="text-slate-400 text-xs ml-2">{selected.item_code}</span>
          </div>
        ) : (
          <span className="text-slate-400">Select inventory item…</span>
        )}
        {selected ? (
          <X className="w-4 h-4 text-slate-400 flex-shrink-0" onClick={(e) => { e.stopPropagation(); onChange(null); setOpen(false) }} />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-100">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-lg">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search by name or code…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>
          <ul className="overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-6 text-sm text-slate-400 text-center">No items found</li>
            ) : filtered.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => { onChange(item); setOpen(false) }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors flex items-start gap-3 ${item.id === value ? 'bg-blue-50' : ''}`}
                >
                  <Package className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900">{item.item_name}</p>
                    <p className="text-xs text-slate-500">{item.item_code} · {item.unit_of_measure} · Stock: {item.current_stock}</p>
                  </div>
                  {item.purchase_price > 0 && (
                    <span className="text-xs text-slate-500 flex-shrink-0">KWD {item.purchase_price.toFixed(3)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Main Form ──────────────────────────────────────────────
export function NewPurchaseInvoiceForm({
  suppliers,
  inventoryItems,
}: {
  suppliers: Supplier[]
  inventoryItems: InvItem[]
}) {
  const router = useRouter()

  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(TODAY)
  const [dueDate, setDueDate] = useState('')
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('credit')
  const [paymentMode, setPaymentMode] = useState('cash')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItem[]>([emptyLine()])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const updateLine = useCallback((idx: number, field: keyof LineItem, val: string) => {
    setLines(prev => { const n = [...prev]; n[idx] = { ...n[idx], [field]: val }; return n })
  }, [])

  const selectItem = useCallback((idx: number, item: InvItem | null) => {
    setLines(prev => {
      const n = [...prev]
      if (!item) {
        n[idx] = emptyLine()
      } else {
        n[idx] = {
          ...n[idx],
          inventory_item_id: item.id,
          description: item.item_name,
          unit_of_measure: item.unit_of_measure,
          unit_cost: item.purchase_price > 0 ? item.purchase_price.toFixed(3) : '',
        }
      }
      return n
    })
  }, [])

  const addLine = () => setLines(prev => [...prev, emptyLine()])
  const removeLine = (idx: number) => { if (lines.length > 1) setLines(prev => prev.filter((_, i) => i !== idx)) }

  const subtotal = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_cost) || 0), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    for (const l of lines) {
      if (!l.inventory_item_id) { setError('All line items must have an inventory item selected'); return }
      if (!l.quantity || parseFloat(l.quantity) <= 0) { setError('All quantities must be greater than 0'); return }
      if (l.unit_cost === '' || parseFloat(l.unit_cost) < 0) { setError('All unit costs must be 0 or greater'); return }
    }

    setLoading(true)
    try {
      const res = await fetch('/api/purchase-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId || null,
          supplier_name: supplierId ? null : supplierName.trim() || null,
          invoice_date: invoiceDate,
          due_date: paymentType === 'credit' ? (dueDate || null) : null,
          payment_type: paymentType,
          payment_mode: paymentType === 'cash' ? paymentMode : null,
          notes: notes.trim() || null,
          items: lines.map(l => ({
            inventory_item_id: l.inventory_item_id,
            description: l.description,
            quantity: parseFloat(l.quantity) || 1,
            unit_cost: parseFloat(l.unit_cost) || 0,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create purchase invoice')
      router.push(`/inventory/purchase-invoices/${data.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save purchase invoice')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">

      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Purchase Details</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Supplier */}
          <div>
            <label className={labelCls}>Supplier</label>
            <select
              value={supplierId}
              onChange={e => { setSupplierId(e.target.value); if (e.target.value) setSupplierName('') }}
              className={inputCls}
            >
              <option value="">— Select supplier —</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.supplier_name}</option>
              ))}
            </select>
          </div>

          {!supplierId && (
            <div>
              <label className={labelCls}>Supplier Name <span className="text-slate-400 font-normal text-xs">(if not in list)</span></label>
              <input
                type="text"
                value={supplierName}
                onChange={e => setSupplierName(e.target.value)}
                placeholder="e.g. Al-Sayer Trading"
                className={inputCls}
              />
            </div>
          )}

          <div>
            <label className={labelCls}>Invoice Date <span className="text-red-500">*</span></label>
            <input type="date" required value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Payment Type */}
        <div>
          <label className={labelCls}>Payment Type <span className="text-red-500">*</span></label>
          <div className="flex gap-3">
            {(['credit', 'cash'] as const).map(pt => (
              <label key={pt} className="cursor-pointer flex-1">
                <input type="radio" className="sr-only" checked={paymentType === pt} onChange={() => setPaymentType(pt)} />
                <div className={`text-center py-3 rounded-xl border-2 text-sm font-semibold transition-all ${paymentType === pt ? (pt === 'cash' ? 'bg-green-600 border-green-600 text-white' : 'bg-blue-600 border-blue-600 text-white') : 'border-slate-200 text-slate-500 hover:border-blue-200'}`}>
                  {pt === 'cash' ? '💵 Cash Purchase' : '🏦 Credit Purchase'}
                </div>
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            {paymentType === 'cash' ? 'Payment made immediately — inventory and cash updated.' : 'Goods received now, payment to supplier due later.'}
          </p>
        </div>

        {paymentType === 'cash' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Payment Mode</label>
              <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className={inputCls}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="knet">KNET</option>
              </select>
            </div>
          </div>
        )}

        {paymentType === 'credit' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
            </div>
          </div>
        )}

        <div>
          <label className={labelCls}>Notes</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none" />
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">Items Purchased</h2>
          <span className="text-xs text-slate-500">All items must exist in Inventory</span>
        </div>

        <div className="space-y-3">
          {/* Column headers */}
          <div className="hidden sm:grid sm:grid-cols-12 gap-3 px-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <div className="col-span-5">Inventory Item</div>
            <div className="col-span-2">Qty</div>
            <div className="col-span-2">Unit</div>
            <div className="col-span-2">Unit Cost (KWD)</div>
            <div className="col-span-1">Total</div>
          </div>

          {lines.map((line, idx) => (
            <div key={idx} className="sm:grid sm:grid-cols-12 gap-3 items-center space-y-2 sm:space-y-0 p-3 sm:p-0 bg-slate-50 sm:bg-transparent rounded-lg sm:rounded-none">
              {/* Item Selector */}
              <div className="sm:col-span-5">
                <ItemCombobox
                  items={inventoryItems}
                  value={line.inventory_item_id}
                  onChange={item => selectItem(idx, item)}
                />
              </div>

              {/* Qty */}
              <div className="sm:col-span-2">
                <input
                  type="number" min="0.001" step="0.001"
                  value={line.quantity}
                  onChange={e => updateLine(idx, 'quantity', e.target.value)}
                  placeholder="Qty"
                  className={inputCls}
                />
              </div>

              {/* Unit */}
              <div className="sm:col-span-2">
                <input
                  type="text" readOnly
                  value={line.unit_of_measure}
                  placeholder="—"
                  className="w-full border border-slate-100 rounded-lg px-3 py-2.5 text-sm text-slate-500 bg-slate-50"
                />
              </div>

              {/* Unit Cost */}
              <div className="sm:col-span-2">
                <input
                  type="number" min="0" step="0.001"
                  value={line.unit_cost}
                  onChange={e => updateLine(idx, 'unit_cost', e.target.value)}
                  placeholder="0.000"
                  className={inputCls}
                />
              </div>

              {/* Total + Remove */}
              <div className="sm:col-span-1 flex items-center justify-between sm:justify-end gap-2">
                <span className="text-sm font-semibold text-slate-700">
                  {((parseFloat(line.quantity) || 0) * (parseFloat(line.unit_cost) || 0)).toFixed(3)}
                </span>
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(idx)}
                    className="text-slate-400 hover:text-red-500 transition-colors p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}

          <button type="button" onClick={addLine}
            className="flex items-center gap-2 text-sm text-blue-600 font-semibold hover:text-blue-700 transition-colors px-1 py-1">
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>

        {/* Totals */}
        <div className="border-t border-slate-100 mt-4 pt-4">
          <div className="max-w-xs ml-auto space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-medium">KWD {subtotal.toFixed(3)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-2 text-base">
              <span>Total</span>
              <span>KWD {subtotal.toFixed(3)}</span>
            </div>
            {paymentType === 'cash' && (
              <div className="flex justify-between text-green-700 font-semibold">
                <span>Payment Status</span>
                <span>Paid</span>
              </div>
            )}
            {paymentType === 'credit' && (
              <div className="flex justify-between text-amber-600 font-semibold">
                <span>Balance Due</span>
                <span>KWD {subtotal.toFixed(3)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pb-6">
        <button type="submit" disabled={loading}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : '✅ Save & Update Inventory'}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-6 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}
