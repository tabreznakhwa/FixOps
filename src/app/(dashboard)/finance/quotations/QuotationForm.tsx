'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, Plus, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Customer {
  id: string
  full_name: string
  mobile_number: string | null
  company_name: string | null
}

interface LineItem {
  description: string
  quantity: string
  unit_price: string
}

interface InitialQuotation {
  id: string
  customer_id: string
  work_order_id: string | null
  quotation_date: string
  valid_until: string | null
  discount_amount: number
  notes: string | null
  terms_and_conditions: string | null
  items: Array<{ description: string; quantity: number; unit_price: number }>
}

interface Props {
  customers: Customer[]
  initial?: InitialQuotation
}

const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })
const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

function emptyItem(): LineItem {
  return { description: '', quantity: '1', unit_price: '' }
}

export function QuotationForm({ customers, initial }: Props) {
  const router = useRouter()
  const [customerId, setCustomerId] = useState(initial?.customer_id ?? '')
  const [quotationDate, setQuotationDate] = useState(initial?.quotation_date ?? TODAY)
  const [validUntil, setValidUntil] = useState(initial?.valid_until ?? '')
  const [items, setItems] = useState<LineItem[]>(initial?.items.length ? initial.items.map(i => ({ description: i.description, quantity: String(i.quantity), unit_price: String(i.unit_price) })) : [emptyItem()])
  const [discountAmount, setDiscountAmount] = useState(String(initial?.discount_amount ?? 0))
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [terms, setTerms] = useState(initial?.terms_and_conditions ?? 'Quotation valid as per the validity date above. Prices are in KWD. Work will start after customer approval.')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0), [items])
  const discount = Math.max(0, Number(discountAmount) || 0)
  const total = Math.max(0, subtotal - discount)

  function updateItem(index: number, field: keyof LineItem, value: string) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  function addItem() {
    setItems(prev => [...prev, emptyItem()])
  }

  function removeItem(index: number) {
    if (items.length === 1) return
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!customerId) { setError('Please select a customer'); return }
    if (items.some(item => !item.description.trim())) { setError('All line items need a description'); return }

    setLoading(true)
    try {
      const res = await fetch(initial ? `/api/quotations/${initial.id}` : '/api/quotations', {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          quotation_date: quotationDate,
          valid_until: validUntil || null,
          discount_amount: discount,
          notes: notes.trim() || null,
          terms_and_conditions: terms.trim() || null,
          items: items.map(item => ({
            description: item.description.trim(),
            quantity: Number(item.quantity) || 1,
            unit_price: Number(item.unit_price) || 0,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save quotation')
      router.push(`/finance/quotations/${data.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save quotation')
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

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        <h2 className="font-semibold text-slate-900">Quotation Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Customer *</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} required className={inputClass}>
              <option value="">— Select customer —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.full_name}{c.company_name ? ` — ${c.company_name}` : ''}{c.mobile_number ? ` · ${c.mobile_number}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Quotation Date *</label>
            <input type="date" value={quotationDate} onChange={e => setQuotationDate(e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Valid Until</label>
            <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Line Items</h2>
          <button type="button" onClick={addItem} className="flex items-center gap-1.5 text-sm text-blue-600 font-semibold hover:text-blue-700">
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>
        <div className="space-y-3">
          <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
            <div className="col-span-7">Description</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2 text-right">Unit Price</div>
            <div className="col-span-1 text-right">Total</div>
          </div>
          {items.map((item, index) => {
            const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
            return (
              <div key={index} className="grid grid-cols-12 gap-2 items-center bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="col-span-12 md:col-span-7">
                  <input value={item.description} onChange={e => updateItem(index, 'description', e.target.value)} placeholder="Description *" required className={inputClass} />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} required className={`${inputClass} text-right`} />
                </div>
                <div className="col-span-5 md:col-span-2">
                  <input type="number" min="0" step="0.001" value={item.unit_price} onChange={e => updateItem(index, 'unit_price', e.target.value)} placeholder="0.000" required className={`${inputClass} text-right`} />
                </div>
                <div className="col-span-2 md:col-span-1 text-right text-sm font-semibold text-slate-800">{formatCurrency(lineTotal)}</div>
                <button type="button" onClick={() => removeItem(index)} disabled={items.length === 1} className="col-span-1 text-slate-400 hover:text-red-500 disabled:opacity-30">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">Discount</h2>
          <div>
            <label className={labelClass}>Discount Amount (KWD)</label>
            <input type="number" min="0" step="0.001" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Totals</h2>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="font-medium text-slate-900">{formatCurrency(subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between text-slate-600"><span>Discount</span><span className="font-medium text-green-700">− {formatCurrency(discount)}</span></div>}
            <div className="border-t border-slate-200 pt-2.5 flex justify-between"><span className="font-bold text-slate-900 text-base">Total</span><span className="font-bold text-blue-600 text-base">{formatCurrency(total)}</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <label className={labelClass}>Notes</label>
          <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Customer-facing notes…" className={`${inputClass} resize-none`} />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <label className={labelClass}>Terms & Conditions</label>
          <textarea rows={4} value={terms} onChange={e => setTerms(e.target.value)} className={`${inputClass} resize-none`} />
        </div>
      </div>

      <div className="flex items-center gap-3 pb-6">
        <button type="submit" disabled={loading} className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
          {loading ? 'Saving…' : initial ? 'Save Quotation' : 'Create Quotation'}
        </button>
        <Link href={initial ? `/finance/quotations/${initial.id}` : '/finance/quotations'} className="px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
          Cancel
        </Link>
      </div>
    </form>
  )
}
