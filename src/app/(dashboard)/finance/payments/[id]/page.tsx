'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, AlertCircle, Loader2, Save } from 'lucide-react'

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'pos', label: 'POS' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online' },
  { value: 'other', label: 'Other' },
]

const MODE_ICONS: Record<string, string> = {
  cash: '💵', bank_transfer: '🏦', card: '💳', pos: '🖥️',
  cheque: '📄', online: '🌐', other: '💰',
}

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

function fmt(n: number) {
  return `KWD ${n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface Payment {
  id: string
  payment_number: string
  payment_date: string
  amount_received: number
  payment_mode: string
  reference_number: string | null
  notes: string | null
  is_advance: boolean
  is_cancelled: boolean
  cancelled_reason: string | null
  customers: { id: string; full_name: string; mobile_number: string } | null
  invoices: { id: string; invoice_number: string; total_amount: number } | null
}

export default function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [payment, setPayment] = useState<Payment | null>(null)
  const [loadError, setLoadError] = useState('')

  // Edit form state
  const [paymentDate, setPaymentDate] = useState('')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showCancel, setShowCancel] = useState(false)

  useEffect(() => {
    fetch(`/api/payments/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setLoadError(data.error); return }
        setPayment(data.payment)
        setPaymentDate(data.payment.payment_date ?? '')
        setAmount(String(data.payment.amount_received ?? ''))
        setMode(data.payment.payment_mode ?? 'cash')
        setReference(data.payment.reference_number ?? '')
        setNotes(data.payment.notes ?? '')
      })
      .catch(() => setLoadError('Failed to load payment'))
  }, [id])

  const handleSave = async () => {
    setSaveError('')
    setSaveSuccess(false)
    if (!paymentDate) { setSaveError('Payment date is required'); return }
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setSaveError('Amount must be greater than zero'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/payments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_date: paymentDate,
          amount_received: amt,
          payment_mode: mode,
          reference_number: reference.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Update failed')
      setSaveSuccess(true)
      // Refresh payment data
      const fresh = await fetch(`/api/payments/${id}`).then(r => r.json())
      if (fresh.payment) setPayment(fresh.payment)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async () => {
    if (!cancelReason.trim()) { setSaveError('Please enter a cancellation reason'); return }
    setCancelling(true)
    try {
      const res = await fetch(`/api/payments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_cancelled: true, cancelled_reason: cancelReason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Cancellation failed')
      router.push('/finance/payments')
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Cancellation failed')
      setCancelling(false)
    }
  }

  if (loadError) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{loadError}</div>
      </div>
    )
  }

  if (!payment) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-mono">{payment.payment_number}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {payment.is_advance ? 'Advance Payment' : 'Payment'} · {fmtDate(payment.payment_date)}
          </p>
        </div>
        <Link
          href="/finance/payments"
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Payments
        </Link>
      </div>

      <div className="p-6 max-w-2xl space-y-5">
        {/* Cancelled banner */}
        {payment.is_cancelled && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <p className="font-semibold">This payment has been cancelled</p>
            {payment.cancelled_reason && <p className="mt-0.5">{payment.cancelled_reason}</p>}
          </div>
        )}

        {/* Linked info */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h2 className="font-semibold text-slate-900 text-sm">Linked To</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Customer</p>
              <p className="font-semibold text-slate-900">{payment.customers?.full_name ?? '—'}</p>
              {payment.customers?.mobile_number && <p className="text-xs text-slate-500">{payment.customers.mobile_number}</p>}
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Invoice</p>
              {payment.invoices ? (
                <Link href={`/finance/invoices/${payment.invoices.id}`} className="font-semibold text-blue-600 hover:underline font-mono">
                  {payment.invoices.invoice_number}
                </Link>
              ) : (
                <p className="text-slate-400 italic text-xs">Advance — no invoice</p>
              )}
            </div>
          </div>
        </div>

        {/* Edit form */}
        {!payment.is_cancelled && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h2 className="font-semibold text-slate-900 text-sm">Edit Payment</h2>

            {saveError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{saveError}</span>
              </div>
            )}
            {saveSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2.5 rounded-lg text-sm font-medium">
                Payment updated successfully.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Payment Date *</label>
                <input type="date" className={inputClass} value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Amount (KWD) *</label>
                <input type="number" min="0.001" step="0.001" className={inputClass} value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Payment Mode *</label>
                <select className={inputClass} value={mode} onChange={e => setMode(e.target.value)}>
                  {PAYMENT_MODES.map(m => (
                    <option key={m.value} value={m.value}>{MODE_ICONS[m.value]} {m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Reference Number</label>
                <input type="text" placeholder="Cheque no., transfer ref., etc." className={inputClass} value={reference} onChange={e => setReference(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Notes</label>
                <textarea className={`${inputClass} resize-none`} rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {/* Cancel section */}
        {!payment.is_cancelled && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            {!showCancel ? (
              <button
                onClick={() => setShowCancel(true)}
                className="text-sm text-red-500 hover:text-red-700 font-medium transition"
              >
                Cancel This Payment
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-red-700">Cancel Payment</p>
                <p className="text-xs text-slate-500">This will restore the invoice balance by {fmt(parseFloat(amount) || 0)}.</p>
                <input
                  type="text"
                  placeholder="Reason for cancellation *"
                  className={inputClass}
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition disabled:opacity-60"
                  >
                    {cancelling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Confirm Cancel
                  </button>
                  <button onClick={() => setShowCancel(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
