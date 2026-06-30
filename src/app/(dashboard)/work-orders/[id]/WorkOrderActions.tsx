'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ChevronDown, CheckCircle, Banknote, X, FileText } from 'lucide-react'

interface Person { id: string; full_name: string; type: 'user' | 'staff'; role: string }

interface Props {
  workOrderId: string
  currentStatus: string
  currentAssigneeKey: string | null
  technicians: Person[]
  customerId: string | null
  finalAmount: number
  paymentStatus: string
  existingInvoiceId: string | null
}

export function WorkOrderActions({
  workOrderId, currentStatus, currentAssigneeKey, technicians,
  customerId, finalAmount, paymentStatus, existingInvoiceId,
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [assigneeKey, setAssigneeKey] = useState(currentAssigneeKey ?? '')

  // Payment collection state
  const [showPayForm, setShowPayForm] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState('cash')
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [payError, setPayError] = useState('')
  const [payingSaving, setPayingSaving] = useState(false)

  const isCompleted = currentStatus === 'completed'
  const isCancelled = currentStatus === 'cancelled'
  const isPaid = paymentStatus === 'paid'

  const update = async (payload: Record<string, unknown>) => {
    const key = String(Object.keys(payload)[0])
    setLoading(key)
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Update failed')
      router.refresh()
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(null)
    }
  }

  const saveAssignment = () => {
    const [pType, pId] = assigneeKey ? assigneeKey.split(':') : []
    const person = technicians.find(t => t.id === pId && t.type === pType)
    update({
      assigned_to: pType === 'user' ? pId ?? null : null,
      assigned_staff_id: pType === 'staff' ? pId ?? null : null,
      technician_name: person?.full_name ?? null,
      status: person && currentStatus === 'new' ? 'assigned' : currentStatus,
    })
  }

  async function handleCollectPayment(e: React.FormEvent) {
    e.preventDefault()
    setPayError('')
    const amt = parseFloat(payAmount)
    if (isNaN(amt) || amt <= 0) { setPayError('Enter a valid amount'); return }
    if (!customerId) { setPayError('No customer linked to this work order'); return }

    setPayingSaving(true)
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/collect-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, payment_mode: payMode, payment_date: payDate }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to record payment')
      setShowPayForm(false)
      setPayAmount('')
      router.refresh()
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setPayingSaving(false)
    }
  }

  const systemUsers = technicians.filter(t => t.type === 'user')
  const staffMembers = technicians.filter(t => t.type === 'staff')

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="font-semibold text-slate-900">Actions</h2>

      {/* Assign Technician */}
      {!isCompleted && !isCancelled && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assign Technician</label>
          <div className="relative">
            <select
              value={assigneeKey}
              onChange={e => setAssigneeKey(e.target.value)}
              className="w-full bg-white text-slate-900 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-8"
            >
              <option value="">Unassigned</option>
              {systemUsers.length > 0 && (
                <optgroup label="System Users">
                  {systemUsers.map(t => (
                    <option key={t.id} value={`user:${t.id}`}>{t.full_name} — {t.role}</option>
                  ))}
                </optgroup>
              )}
              {staffMembers.length > 0 && (
                <optgroup label="Staff Members">
                  {staffMembers.map(t => (
                    <option key={t.id} value={`staff:${t.id}`}>{t.full_name}{t.role ? ` — ${t.role}` : ''}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          <button
            onClick={saveAssignment}
            disabled={!!loading}
            className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading === 'assigned_to' || loading === 'technician_name' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save Assignment
          </button>
        </div>
      )}

      {/* Mark Complete */}
      {!isCompleted && !isCancelled && (
        <div className="border-t border-slate-100 pt-4">
          <button
            onClick={() => {
              if (confirm('Mark this work order as completed?')) update({ status: 'completed' })
            }}
            disabled={!!loading}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading === 'status' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Mark as Completed
          </button>
        </div>
      )}

      {isCompleted && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2.5">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm font-semibold">Job Completed</span>
        </div>
      )}

      {/* Collect Payment */}
      {!isCancelled && !isPaid && customerId && (
        <div className="border-t border-slate-100 pt-4">
          {!showPayForm ? (
            <button
              onClick={() => {
                setPayAmount(finalAmount > 0 ? finalAmount.toFixed(3) : '')
                setShowPayForm(true)
              }}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2"
            >
              <Banknote className="w-4 h-4" />
              Collect Payment
            </button>
          ) : (
            <form onSubmit={handleCollectPayment} className="space-y-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Collect Payment</span>
                <button type="button" onClick={() => { setShowPayForm(false); setPayError('') }}
                  className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Amount (KWD)</label>
                <input
                  type="number" step="0.001" min="0.001"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  placeholder="0.000"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Payment Mode</label>
                <select
                  value={payMode}
                  onChange={e => setPayMode(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="knet">KNET</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Date</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {payError && <p className="text-xs text-red-600">{payError}</p>}
              <button
                type="submit"
                disabled={payingSaving}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {payingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                Record Payment
              </button>
            </form>
          )}
        </div>
      )}

      {isPaid && (
        <div className="border-t border-slate-100 pt-4 flex items-center gap-2 text-blue-700 bg-blue-50 rounded-lg px-3 py-2.5">
          <Banknote className="w-4 h-4" />
          <span className="text-sm font-semibold">Payment Received</span>
        </div>
      )}

      {/* Invoice */}
      {!isCancelled && (
        <div className="border-t border-slate-100 pt-4">
          {existingInvoiceId ? (
            <Link
              href={`/finance/invoices/${existingInvoiceId}`}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              View Invoice
            </Link>
          ) : isCompleted ? (
            <Link
              href={`/finance/invoices/new?work_order_id=${workOrderId}`}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Create Invoice
            </Link>
          ) : null}
        </div>
      )}

      {/* Cancel */}
      {!isCompleted && !isCancelled && (
        <button
          onClick={() => { if (confirm('Cancel this work order?')) update({ status: 'cancelled' }) }}
          disabled={!!loading}
          className="w-full py-2 text-red-500 hover:text-red-700 text-sm font-medium transition"
        >
          Cancel Work Order
        </button>
      )}
    </div>
  )
}
