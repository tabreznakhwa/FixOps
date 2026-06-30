'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'

interface Supplier { id: string; supplier_name: string; supplier_code: string }
interface OpenPO { id: string; po_number: string; supplier_id: string; balance_due: number; total_amount: number }
interface OpenInvoice {
  id: string; invoice_number: string; supplier_invoice_number: string | null
  supplier_id: string; invoice_date: string; balance_due: number; total_amount: number
}
interface OpenPayable {
  id: string; bill_ref: string; supplier_id: string; bill_date: string; balance_due: number; amount: number
}

interface Props {
  suppliers: Supplier[]
  openPOs: OpenPO[]
  defaultPO: { id: string; po_number: string; supplier_id: string; balance_due: number } | null
  openInvoices: OpenInvoice[]
  openPayables: OpenPayable[]
}

interface PayableLine {
  key: string
  type: 'invoice' | 'opening'
  id: string
  title: string
  subtitle: string | null
  date: string
  balance: number
}

const PAYMENT_MODES = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'pos', label: 'POS' },
  { value: 'online', label: 'Online' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

export function VendorPaymentForm({ suppliers, openPOs, defaultPO, openInvoices, openPayables }: Props) {
  const [supplierId, setSupplierId] = useState(defaultPO?.supplier_id ?? '')
  const [poId, setPoId] = useState(defaultPO?.id ?? '')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [amount, setAmount] = useState(defaultPO?.balance_due ? String(defaultPO.balance_due) : '')
  const [mode, setMode] = useState('bank_transfer')
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // POs filtered by selected supplier
  const supplierPOs = supplierId ? openPOs.filter((p) => p.supplier_id === supplierId) : openPOs

  // Combined outstanding lines (purchase invoices + opening payables) for the selected supplier
  const payableLines: PayableLine[] = supplierId
    ? [
        ...openInvoices
          .filter((i) => i.supplier_id === supplierId)
          .map((i) => ({
            key: `inv:${i.id}`,
            type: 'invoice' as const,
            id: i.id,
            title: i.invoice_number,
            subtitle: i.supplier_invoice_number,
            date: i.invoice_date,
            balance: Number(i.balance_due),
          })),
        ...openPayables
          .filter((p) => p.supplier_id === supplierId)
          .map((p) => ({
            key: `op:${p.id}`,
            type: 'opening' as const,
            id: p.id,
            title: p.bill_ref,
            subtitle: 'Opening Balance',
            date: p.bill_date,
            balance: Number(p.balance_due),
          })),
      ].sort((a, b) => a.date.localeCompare(b.date))
    : []

  // When PO is selected, auto-fill amount with balance due, and clear any selected lines
  useEffect(() => {
    if (!poId) return
    const po = openPOs.find((p) => p.id === poId)
    if (po) setAmount(String(po.balance_due))
    setSelectedKeys([])
  }, [poId, openPOs])

  // When lines are selected, auto-fill amount with total balance due, and clear PO
  useEffect(() => {
    if (selectedKeys.length === 0) return
    const total = payableLines
      .filter((l) => selectedKeys.includes(l.key))
      .reduce((s, l) => s + l.balance, 0)
    setAmount(total.toFixed(3))
    setPoId('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKeys])

  // When supplier changes, clear PO/line selections that don't belong to new supplier
  useEffect(() => {
    if (poId) {
      const po = openPOs.find((p) => p.id === poId)
      if (po && po.supplier_id !== supplierId) setPoId('')
    }
    setSelectedKeys([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId])

  const selectedPO = openPOs.find((p) => p.id === poId)
  const selectedTotal = payableLines
    .filter((l) => selectedKeys.includes(l.key))
    .reduce((s, l) => s + l.balance, 0)

  function toggleLine(key: string) {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!supplierId) { setError('Please select a supplier'); return }
    if (!amount || Number(amount) <= 0) { setError('Enter a valid amount'); return }

    const invoice_ids = selectedKeys.filter((k) => k.startsWith('inv:')).map((k) => k.split(':')[1])
    const opening_payable_ids = selectedKeys.filter((k) => k.startsWith('op:')).map((k) => k.split(':')[1])

    setLoading(true)
    try {
      const res = await fetch('/api/suppliers/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          purchase_order_id: poId || null,
          invoice_ids,
          opening_payable_ids,
          payment_date: date,
          amount_paid: Number(amount),
          payment_mode: mode,
          reference_number: reference.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to record payment'); return }
      window.location.href = '/suppliers/vendor-payments'
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div>
        <label className={labelClass}>Supplier <span className="text-red-500">*</span></label>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required className={inputClass}>
          <option value="">— Select supplier —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.supplier_name} ({s.supplier_code})</option>
          ))}
        </select>
      </div>

      {supplierId && payableLines.length > 0 && (
        <div>
          <label className={labelClass}>Outstanding Bills <span className="text-slate-400 font-normal">(optional — select which to pay)</span></label>
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto">
            {payableLines.map((line) => (
              <label key={line.key} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-slate-50">
                <span className="flex items-center gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={selectedKeys.includes(line.key)}
                    onChange={() => toggleLine(line.key)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="min-w-0">
                    <span className="font-medium text-slate-900">{line.title}</span>
                    {line.subtitle && (
                      <span className={`text-xs ml-1.5 ${line.type === 'opening' ? 'text-amber-600' : 'text-slate-400'}`}>
                        ({line.subtitle})
                      </span>
                    )}
                    <span className="block text-xs text-slate-400">{new Date(line.date).toLocaleDateString('en-GB')}</span>
                  </span>
                </span>
                <span className="text-slate-700 font-semibold flex-shrink-0">{formatCurrency(line.balance)}</span>
              </label>
            ))}
          </div>
          {selectedKeys.length > 0 && (
            <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
              {selectedKeys.length} bill{selectedKeys.length > 1 ? 's' : ''} selected · Total: <strong>{formatCurrency(selectedTotal)}</strong>
            </p>
          )}
        </div>
      )}

      <div>
        <label className={labelClass}>Purchase Order <span className="text-slate-400 font-normal">(optional)</span></label>
        <select value={poId} onChange={(e) => setPoId(e.target.value)} className={inputClass}>
          <option value="">— Select PO —</option>
          {supplierPOs.map((po) => (
            <option key={po.id} value={po.id}>
              {po.po_number} · Balance: {formatCurrency(po.balance_due)} / {formatCurrency(po.total_amount)}
            </option>
          ))}
        </select>
        {selectedPO && (
          <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
            Outstanding balance: <strong>{formatCurrency(selectedPO.balance_due)}</strong>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Payment Date <span className="text-red-500">*</span></label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Amount Paid <span className="text-red-500">*</span></label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            min="0.001" step="0.001" required placeholder="0.000" className={`${inputClass} text-right font-semibold`} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Payment Mode</label>
        <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputClass}>
          {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      <div>
        <label className={labelClass}>Reference / Cheque No.</label>
        <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. CHQ-12345 or TXN-REF" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional remarks…" className={inputClass} />
      </div>

      <button type="submit" disabled={loading}
        className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
        {loading ? 'Recording…' : 'Record Payment'}
      </button>
    </form>
  )
}
