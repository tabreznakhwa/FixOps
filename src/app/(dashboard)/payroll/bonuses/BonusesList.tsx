'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Gift, PlusCircle, AlertCircle, Pencil, Check, X, Loader2, Ban } from 'lucide-react'

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'pos', label: 'POS' },
  { value: 'card', label: 'Card' },
  { value: 'online', label: 'Online' },
  { value: 'knet', label: 'KNET' },
]
const MODE_LABELS: Record<string, string> = {
  cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque',
  pos: 'POS', card: 'Card', online: 'Online', knet: 'KNET',
}

interface Bonus {
  id: string; bonus_number: string; bonus_date: string; amount: number
  payment_mode: string; notes: string | null; is_voided: boolean; void_reason: string | null
  created_at: string; staff: { full_name: string } | null
}
interface Staff {
  id: string; full_name: string; staff_code: string; employment_status: string
}
interface Props { bonuses: Bonus[]; staff: Staff[]; canEdit: boolean }

export function BonusesList({ bonuses: initial, staff, canEdit }: Props) {
  const router = useRouter()
  const [bonuses, setBonuses] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState('')

  const [showVoided, setShowVoided] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    bonus_date: '', amount: '', payment_mode: 'cash', notes: '',
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const [voidingId, setVoidingId] = useState<string | null>(null)

  const blank = () => ({
    staff_id: '',
    bonus_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' }),
    amount: '',
    payment_mode: 'cash',
    notes: '',
  })
  const [form, setForm] = useState(blank)

  function openForm() {
    setForm(blank())
    setIdempotencyKey(crypto.randomUUID())
    setError('')
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const amt = Number(form.amount)
    if (!form.staff_id) { setError('Select an employee'); return }
    if (!form.bonus_date) { setError('Date is required'); return }
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/staff-bonuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: form.staff_id,
          bonus_date: form.bonus_date,
          amount: amt,
          payment_mode: form.payment_mode,
          notes: form.notes || null,
          idempotency_key: idempotencyKey,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return }
      setBonuses(prev => [data, ...prev])
      setShowForm(false)
      setForm(blank())
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(b: Bonus) {
    setEditingId(b.id)
    setEditError('')
    setEditForm({
      bonus_date: b.bonus_date,
      amount: String(b.amount),
      payment_mode: b.payment_mode,
      notes: b.notes ?? '',
    })
  }

  async function handleUpdate(id: string) {
    const amt = Number(editForm.amount)
    if (!editForm.bonus_date) { setEditError('Date is required'); return }
    if (!amt || amt <= 0) { setEditError('Enter a valid amount'); return }
    setEditSaving(true)
    setEditError('')
    try {
      const res = await fetch('/api/staff-bonuses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editForm, amount: amt }),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.error ?? 'Failed to update'); return }
      setBonuses(prev => prev.map(b => (b.id === id ? { ...b, ...data } : b)))
      setEditingId(null)
      router.refresh()
    } catch {
      setEditError('Network error. Please try again.')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleVoid(b: Bonus) {
    const reason = prompt(`Void this bonus of ${formatCurrency(b.amount)} for ${b.staff?.full_name ?? 'Staff'}?\nReason (will be kept in the audit trail):`)
    if (reason === null) return
    setVoidingId(b.id)
    try {
      const res = await fetch('/api/staff-bonuses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: b.id, void: true, void_reason: reason }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? 'Failed to void'); return }
      setBonuses(prev => prev.map(x => (x.id === b.id ? { ...x, ...data } : x)))
      router.refresh()
    } catch {
      alert('Network error — please try again')
    } finally {
      setVoidingId(null)
    }
  }

  const visible = showVoided ? bonuses : bonuses.filter(b => !b.is_voided)

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-900">Bonus History</h3>
          <button
            onClick={() => setShowVoided(v => !v)}
            className={`text-xs font-semibold px-2 py-0.5 rounded-md border transition ${showVoided ? 'bg-slate-100 text-slate-600 border-slate-200' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
          >
            {showVoided ? 'Hide voided' : 'Show voided'}
          </button>
        </div>
        {canEdit && !showForm && (
          <button
            onClick={openForm}
            className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            <PlusCircle className="w-4 h-4" /> Record Bonus
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <p className="text-sm font-semibold text-slate-700">Record a Bonus</p>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Employee</label>
              <select
                value={form.staff_id}
                onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}
                className={inputCls}
              >
                <option value="">Select employee…</option>
                {staff.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}{s.employment_status !== 'active' ? ' (former)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date</label>
                <input
                  type="date" required value={form.bonus_date}
                  onChange={e => setForm(f => ({ ...f, bonus_date: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Amount (KWD)</label>
                <input
                  type="number" required step="0.001" min="0.001" placeholder="0.000"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Paid Via</label>
              <select
                value={form.payment_mode}
                onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))}
                className={inputCls}
              >
                {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Reason / Notes <span className="font-normal text-slate-400">(optional)</span></label>
              <input
                type="text" placeholder="e.g. Ramadan appreciation, outstanding performance"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className={inputCls}
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button type="submit" disabled={saving}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
                {saving ? 'Saving…' : 'Save Bonus'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setError('') }}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-100 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* History */}
      {visible.length === 0 ? (
        <div className="p-10 text-center">
          <Gift className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No bonuses recorded yet</p>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Date</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Employee</th>
              <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Amount</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Via</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Reason</th>
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {visible.map(b => (
              editingId === b.id ? (
                <tr key={b.id} className="bg-blue-50/40">
                  <td colSpan={6} className="px-5 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
                        <input type="date" className={inputCls} value={editForm.bonus_date}
                          onChange={e => setEditForm({ ...editForm, bonus_date: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Amount (KWD)</label>
                        <input type="number" min="0" step="0.001" className={inputCls} value={editForm.amount}
                          onChange={e => setEditForm({ ...editForm, amount: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Paid Via</label>
                        <select className={inputCls} value={editForm.payment_mode}
                          onChange={e => setEditForm({ ...editForm, payment_mode: e.target.value })}>
                          {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Reason / Notes</label>
                        <input className={inputCls} value={editForm.notes}
                          onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
                      </div>
                    </div>
                    {editError && <p className="text-xs text-red-600 mt-2">{editError}</p>}
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => handleUpdate(b.id)} disabled={editSaving}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg disabled:opacity-60 transition">
                        {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} disabled={editSaving}
                        className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 transition">
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={b.id} className={`hover:bg-slate-50 transition-colors ${b.is_voided ? 'opacity-60' : ''}`}>
                  <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">
                    {formatDate(b.bonus_date)}
                    <span className="block text-[10px] text-slate-400 font-mono">{b.bonus_number}</span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">
                    {b.staff?.full_name ?? '—'}
                    {b.is_voided && (
                      <span className="block text-[10px] font-semibold text-red-500 uppercase">
                        Voided{b.void_reason ? ` — ${b.void_reason}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-red-600">
                    {b.is_voided ? <s>{formatCurrency(b.amount)}</s> : formatCurrency(b.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                      {MODE_LABELS[b.payment_mode] ?? b.payment_mode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {b.notes ?? <span className="text-slate-400">—</span>}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      {!b.is_voided ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => startEdit(b)}
                            title="Edit bonus"
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded-lg transition"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => handleVoid(b)}
                            disabled={voidingId === b.id}
                            title="Void bonus"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-lg transition disabled:opacity-60"
                          >
                            {voidingId === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Voided</span>
                      )}
                    </td>
                  )}
                </tr>
              )
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
