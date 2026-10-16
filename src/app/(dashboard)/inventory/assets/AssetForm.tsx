'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'
import {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_LABELS,
  ASSET_CONDITIONS,
  ASSET_CONDITION_LABELS,
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  ASSET_PAYMENT_METHODS,
  ASSET_PAYMENT_METHOD_LABELS,
  DISPOSAL_METHODS,
  DISPOSAL_METHOD_LABELS,
  computeDepreciation,
} from '@/lib/assets'
import { formatCurrency } from '@/lib/utils'
import { safeReturnTo, withReturnTo } from '@/lib/backNav'

export interface AssetOption { id: string; name: string }

export interface AssetInitial {
  id: string
  updated_at: string
  asset_name: string
  category: string
  serial_number: string | null
  purchase_date: string | null
  purchase_cost: number
  payment_method: string
  purchase_reference: string | null
  supplier_id: string | null
  assigned_staff_id: string | null
  location: string | null
  condition: string
  status: string
  warranty_expiry: string | null
  service_due_date: string | null
  depreciation_start_date: string | null
  useful_life_months: number | null
  salvage_value: number
  disposal_date: string | null
  disposal_method: string | null
  disposal_proceeds: number | null
  disposal_payment_method: string | null
  disposal_reference: string | null
  disposal_reason: string | null
  notes: string | null
}

interface Props {
  suppliers: AssetOption[]
  staff: AssetOption[]
  initial?: AssetInitial
  cancelHref: string
  returnTo: string
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white'
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })

export function AssetForm({ suppliers, staff, initial, cancelHref, returnTo }: Props) {
  const router = useRouter()
  const cancelDestination = safeReturnTo(cancelHref) ?? (initial ? `/inventory/assets/${initial.id}` : '/inventory/assets')
  const origin = safeReturnTo(returnTo) ?? cancelDestination
  const isEdit = Boolean(initial)
  const assetIdRef = useRef<string | null>(initial?.id ?? null)

  const [form, setForm] = useState({
    asset_name: initial?.asset_name ?? '',
    category: initial?.category ?? 'it_equipment',
    serial_number: initial?.serial_number ?? '',
    purchase_date: initial?.purchase_date ?? todayISO(),
    purchase_cost: initial ? String(initial.purchase_cost) : '',
    payment_method: initial?.payment_method ?? 'cash',
    purchase_reference: initial?.purchase_reference ?? '',
    supplier_id: initial?.supplier_id ?? '',
    assigned_staff_id: initial?.assigned_staff_id ?? '',
    location: initial?.location ?? '',
    condition: initial?.condition ?? 'good',
    status: initial?.status ?? 'available',
    warranty_expiry: initial?.warranty_expiry ?? '',
    service_due_date: initial?.service_due_date ?? '',
    depreciation_start_date: initial?.depreciation_start_date ?? todayISO(),
    useful_life_months: initial?.useful_life_months != null ? String(initial.useful_life_months) : '60',
    salvage_value: initial ? String(initial.salvage_value ?? 0) : '0',
    notes: initial?.notes ?? '',
    disposal_date: initial?.disposal_date ?? '',
    disposal_method: initial?.disposal_method ?? '',
    disposal_proceeds: initial?.disposal_proceeds != null ? String(initial.disposal_proceeds) : '',
    disposal_payment_method: initial?.disposal_payment_method ?? '',
    disposal_reference: initial?.disposal_reference ?? '',
    disposal_reason: initial?.disposal_reason ?? '',
  })

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isDisposed = form.status === 'disposed'
  const lockedDisposed = initial?.status === 'disposed'

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const value = e.target.value
    setForm((f) => field === 'status' && value === 'disposed'
      ? { ...f, status: value, assigned_staff_id: '' }
      : { ...f, [field]: value })
  }

  const depreciation = computeDepreciation({
    purchase_cost: Number(form.purchase_cost),
    salvage_value: Number(form.salvage_value),
    useful_life_months: Number(form.useful_life_months),
    depreciation_start_date: form.depreciation_start_date,
    valuation_date: todayISO(),
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.asset_name.trim()) { setError('Asset name is required'); return }
    if (!form.purchase_date) { setError('Purchase date is required'); return }
    const cost = Number(form.purchase_cost)
    if (!form.purchase_cost || !Number.isFinite(cost) || cost <= 0) {
      setError('Enter a purchase cost greater than zero')
      return
    }
    if (!form.depreciation_start_date) { setError('Depreciation start date is required'); return }
    if (form.depreciation_start_date < form.purchase_date) {
      setError('Depreciation cannot start before the purchase date')
      return
    }
    if (form.warranty_expiry && form.warranty_expiry < form.purchase_date) {
      setError('Warranty expiry cannot be before the purchase date')
      return
    }
    if (form.service_due_date && form.service_due_date < form.purchase_date) {
      setError('Service due date cannot be before the purchase date')
      return
    }
    const usefulLife = Number(form.useful_life_months)
    if (!form.useful_life_months || !Number.isInteger(usefulLife) || usefulLife < 1 || usefulLife > 1200) {
      setError('Enter a useful life between 1 and 1,200 months')
      return
    }
    const salvage = Number(form.salvage_value || '0')
    if (!Number.isFinite(salvage) || salvage < 0 || salvage > cost) {
      setError('Salvage value must be between zero and the purchase cost')
      return
    }
    if (form.status === 'assigned' && !form.assigned_staff_id) {
      setError('Select a custodian for an assigned asset')
      return
    }
    if (isDisposed) {
      if (!isEdit) { setError('Record the asset first, then dispose of it from the edit page'); return }
      if (!form.disposal_date || !form.disposal_method || form.disposal_proceeds === '' || !form.disposal_reason.trim()) {
        setError('Complete all disposal details')
        return
      }
      const proceeds = Number(form.disposal_proceeds)
      if (!Number.isFinite(proceeds) || proceeds < 0) {
        setError('Disposal proceeds must be zero or more')
        return
      }
      if (proceeds > 0 && !form.disposal_payment_method) {
        setError('Select how the disposal proceeds were received')
        return
      }
      if (form.assigned_staff_id) {
        setError('Remove the custodian before disposing of the asset')
        return
      }
    }

    if (!isEdit) {
      if (!assetIdRef.current) assetIdRef.current = crypto.randomUUID()
    }

    const body: Record<string, unknown> = {
      asset_name: form.asset_name.trim(),
      category: form.category,
      serial_number: form.serial_number.trim() || null,
      purchase_date: form.purchase_date,
      purchase_cost: form.purchase_cost,
      payment_method: form.payment_method,
      purchase_reference: form.purchase_reference.trim() || null,
      supplier_id: form.supplier_id || null,
      assigned_staff_id: form.assigned_staff_id || null,
      location: form.location.trim() || null,
      condition: form.condition,
      status: form.status,
      warranty_expiry: form.warranty_expiry || null,
      service_due_date: form.service_due_date || null,
      depreciation_start_date: form.depreciation_start_date,
      useful_life_months: Number(form.useful_life_months),
      salvage_value: form.salvage_value || '0',
      notes: form.notes.trim() || null,
    }

    if (isEdit) {
      body.expected_updated_at = initial!.updated_at
      body.disposal_date = isDisposed ? form.disposal_date || null : null
      body.disposal_method = isDisposed ? form.disposal_method || null : null
      body.disposal_proceeds = isDisposed && form.disposal_proceeds !== ''
        ? form.disposal_proceeds
        : null
      body.disposal_payment_method = isDisposed && Number(form.disposal_proceeds) > 0
        ? form.disposal_payment_method || null
        : null
      body.disposal_reference = isDisposed && Number(form.disposal_proceeds) > 0
        ? form.disposal_reference.trim() || null
        : null
      body.disposal_reason = isDisposed ? form.disposal_reason.trim() || null : null
    } else {
      body.asset_id = assetIdRef.current
    }

    setSubmitting(true)
    try {
      const res = await fetch(isEdit ? `/api/assets/${initial!.id}` : '/api/assets', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to save the asset')
        setSubmitting(false)
        return
      }
      const destination = initial
        ? cancelDestination
        : withReturnTo(`/inventory/assets/${data.asset_id}`, origin)
      router.replace(destination)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-5">
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Identity</h2>
        <div>
          <label className={labelClass}>Asset Name <span className="text-red-500">*</span></label>
          <input type="text" value={form.asset_name} onChange={set('asset_name')} placeholder="e.g. Daikin AC Unit — Workshop" className={inputClass} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Category <span className="text-red-500">*</span></label>
            <select value={form.category} onChange={set('category')} className={inputClass}>
              {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{ASSET_CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Serial Number</label>
            <input type="text" value={form.serial_number} onChange={set('serial_number')} placeholder="Optional" className={inputClass} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Acquisition</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Purchase Date <span className="text-red-500">*</span></label>
            <input type="date" value={form.purchase_date} onChange={set('purchase_date')} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Purchase Cost (KWD) <span className="text-red-500">*</span></label>
            <input type="number" min="0.001" step="0.001" value={form.purchase_cost} onChange={set('purchase_cost')} placeholder="0.000" className={inputClass} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Payment Method <span className="text-red-500">*</span></label>
            <select value={form.payment_method} onChange={set('payment_method')} className={inputClass}>
              {ASSET_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{ASSET_PAYMENT_METHOD_LABELS[m]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Supplier</label>
            <select value={form.supplier_id} onChange={set('supplier_id')} className={inputClass}>
              <option value="">No supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Reference No. <span className="text-slate-400 font-normal">(optional)</span></label>
          <input type="text" value={form.purchase_reference} onChange={set('purchase_reference')} placeholder="e.g. invoice or cheque no." className={inputClass} />
        </div>
        <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">
          {form.payment_method === 'cash'
            ? 'This acquisition will be recorded as a capital purchase in the Cash Book.'
            : 'This acquisition will be recorded as a capital purchase in the Bank Book.'}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Assignment & Condition</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Custodian</label>
            <select value={form.assigned_staff_id} onChange={set('assigned_staff_id')} className={inputClass} disabled={lockedDisposed}>
              <option value="">Unassigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Location</label>
            <input type="text" value={form.location} onChange={set('location')} placeholder="e.g. Workshop, Store" className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Condition</label>
            <select value={form.condition} onChange={set('condition')} className={inputClass}>
              {ASSET_CONDITIONS.map((c) => <option key={c} value={c}>{ASSET_CONDITION_LABELS[c]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select value={form.status} onChange={set('status')} className={inputClass} disabled={lockedDisposed}>
              {ASSET_STATUSES.filter((s) => isEdit || s !== 'disposed').map((s) => <option key={s} value={s}>{ASSET_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        </div>
        {lockedDisposed && (
          <p className="text-xs text-amber-600">This asset has been disposed; its status can no longer be changed.</p>
        )}
        {form.status === 'assigned' && !form.assigned_staff_id && (
          <p className="text-xs text-amber-600">An assigned asset needs a custodian.</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Warranty & Service</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Warranty Expiry</label>
            <input type="date" value={form.warranty_expiry} onChange={set('warranty_expiry')} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Service Due Date</label>
            <input type="date" value={form.service_due_date} onChange={set('service_due_date')} className={inputClass} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Depreciation (straight-line)</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Start Date <span className="text-red-500">*</span></label>
            <input type="date" value={form.depreciation_start_date} onChange={set('depreciation_start_date')} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Useful Life (months) <span className="text-red-500">*</span></label>
            <input type="number" min="1" max="1200" step="1" value={form.useful_life_months} onChange={set('useful_life_months')} className={inputClass} required />
          </div>
        </div>
        <div>
          <label className={labelClass}>Salvage Value (KWD)</label>
          <input type="number" min="0" step="0.001" value={form.salvage_value} onChange={set('salvage_value')} placeholder="0.000" className={inputClass} />
        </div>
        {depreciation.available && (
          <p className="text-xs text-slate-500">
            Monthly depreciation {formatCurrency(depreciation.monthlyDepreciation)} · current book value {formatCurrency(depreciation.bookValue)}
          </p>
        )}
      </div>

      {isDisposed && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Disposal</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Disposal Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.disposal_date} onChange={set('disposal_date')} className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>Disposal Method <span className="text-red-500">*</span></label>
              <select value={form.disposal_method} onChange={set('disposal_method')} className={inputClass} required>
                <option value="">Select method</option>
                {DISPOSAL_METHODS.map((m) => <option key={m} value={m}>{DISPOSAL_METHOD_LABELS[m]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Proceeds (KWD) <span className="text-slate-400 font-normal">(0 if none)</span></label>
            <input type="number" min="0" step="0.001" value={form.disposal_proceeds} onChange={set('disposal_proceeds')} placeholder="0.000" className={inputClass} required />
          </div>
          {Number(form.disposal_proceeds) > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Receipt Method <span className="text-red-500">*</span></label>
                <select value={form.disposal_payment_method} onChange={set('disposal_payment_method')} className={inputClass} required>
                  <option value="">Select method</option>
                  {ASSET_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{ASSET_PAYMENT_METHOD_LABELS[m]}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Receipt Reference</label>
                <input type="text" value={form.disposal_reference} onChange={set('disposal_reference')} placeholder="Optional" className={inputClass} />
              </div>
            </div>
          )}
          {Number(form.disposal_proceeds) > 0 && (
            <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              These proceeds will appear as a receipt in the {form.disposal_payment_method === 'cash' ? 'Cash' : 'Bank'} Book.
            </p>
          )}
          <div>
            <label className={labelClass}>Reason <span className="text-red-500">*</span></label>
            <textarea value={form.disposal_reason} onChange={set('disposal_reason')} rows={2} className={inputClass + ' resize-none'} required />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Notes</h2>
        <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Any additional notes…" className={inputClass + ' resize-none'} />
      </div>

      <div className="flex items-center justify-end gap-3 pb-6">
        <button type="button" onClick={() => router.replace(cancelDestination)}
          className="px-5 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition">
          Cancel
        </button>
        <button type="submit" disabled={submitting}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition">
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : isEdit ? 'Save Changes' : 'Record Asset'}
        </button>
      </div>
    </form>
  )
}
