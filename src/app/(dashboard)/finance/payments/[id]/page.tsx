'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { DocumentLink } from '@/components/ui/DocumentLink'
import { AlertCircle, Loader2 } from 'lucide-react'
import { BackButton } from '@/components/ui/BackButton'
import { useCurrentPath } from '@/lib/backNav.client'
import { resolveBack, withReturnTo } from '@/lib/backNav'

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white'

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
  const searchParams = useSearchParams()

  const returnToValues = searchParams.getAll('return_to')
  const back = resolveBack(
    returnToValues.length === 1 ? returnToValues[0] : null,
    '/finance/payments',
    'Payments',
  )
  const paymentPath = useCurrentPath()

  const [payment, setPayment] = useState<Payment | null>(null)
  const [loadError, setLoadError] = useState('')

  const [saveError, setSaveError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showCancel, setShowCancel] = useState(false)

  useEffect(() => {
    fetch(`/api/payments/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setLoadError(data.error); return }
        setPayment(data.payment)
      })
      .catch(() => setLoadError('Failed to load payment'))
  }, [id])

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
      router.replace(back.href)
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
        <BackButton href={back.href} label={back.label} />
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
                <DocumentLink
                  href={withReturnTo(`/finance/invoices/${payment.invoices.id}`, paymentPath)}
                  tabLabel={payment.invoices.invoice_number}
                  className="font-semibold text-blue-600 hover:underline font-mono"
                >
                  {payment.invoices.invoice_number}
                </DocumentLink>
              ) : (
                <p className="text-slate-400 italic text-xs">Advance — no invoice</p>
              )}
            </div>
          </div>
        </div>

        {!payment.is_cancelled && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            Posted payment details are locked. To correct this receipt, cancel it and record a replacement payment.
          </div>
        )}

        {saveError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{saveError}</span>
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
                <p className="text-xs text-slate-500">This records an equal-and-opposite posting and restores any linked allocation.</p>
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
