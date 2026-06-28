'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface StaffRecord {
  id: string; full_name: string; designation: string | null; department: string | null
  mobile_number: string | null; email: string | null; nationality: string | null
  passport_number: string | null; visa_number: string | null; emirates_id: string | null
  visa_expiry_date: string | null; passport_expiry_date: string | null
  basic_salary: number; housing_allowance: number; transport_allowance: number
  food_allowance: number | null; other_allowance: number; allowance_name: string | null
  fixed_overtime_monthly: number
  overtime_eligible: boolean; bank_name: string | null; iban: string | null
  employment_status: string; notes: string | null
}

const DEPARTMENTS = ['Operations', 'Technical', 'Administration', 'Finance', 'HR', 'Store', 'Sales']

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1'

export function StaffEditForm({ staff }: { staff: StaffRecord }) {
  const router = useRouter()
  const [form, setForm] = useState({
    full_name: staff.full_name,
    designation: staff.designation ?? '',
    department: staff.department ?? '',
    mobile_number: staff.mobile_number ?? '',
    email: staff.email ?? '',
    nationality: staff.nationality ?? '',
    passport_number: staff.passport_number ?? '',
    visa_number: staff.visa_number ?? '',
    emirates_id: staff.emirates_id ?? '',
    visa_expiry_date: staff.visa_expiry_date ?? '',
    passport_expiry_date: staff.passport_expiry_date ?? '',
    basic_salary: String(staff.basic_salary ?? 0),
    food_allowance: String(staff.food_allowance ?? 0),
    // Merge legacy housing+transport into other_allowance so existing totals are preserved
    other_allowance: String((staff.housing_allowance ?? 0) + (staff.transport_allowance ?? 0) + (staff.other_allowance ?? 0)),
    allowance_name: staff.allowance_name ?? 'Allowance',
    fixed_overtime_monthly: String(staff.fixed_overtime_monthly ?? 0),
    overtime_eligible: staff.overtime_eligible ?? false,
    bank_name: staff.bank_name ?? '',
    iban: staff.iban ?? '',
    employment_status: staff.employment_status,
    notes: staff.notes ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  function set(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch(`/api/staff/${staff.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          basic_salary: Number(form.basic_salary),
          housing_allowance: 0,
          transport_allowance: 0,
          food_allowance: Number(form.food_allowance),
          other_allowance: Number(form.other_allowance),
          allowance_name: form.allowance_name || 'Allowance',
          fixed_overtime_monthly: Number(form.fixed_overtime_monthly),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Save failed'); return }
      setSaved(true)
      router.refresh()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {saved && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">Saved successfully.</p>}

      {/* Basic Info */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">Basic Information</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelClass}>Full Name</label>
            <input type="text" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Designation</label>
            <input type="text" value={form.designation} onChange={(e) => set('designation', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Department</label>
            <select value={form.department} onChange={(e) => set('department', e.target.value)} className={inputClass}>
              <option value="">— Select —</option>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Mobile</label>
            <input type="tel" value={form.mobile_number} onChange={(e) => set('mobile_number', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select value={form.employment_status} onChange={(e) => set('employment_status', e.target.value)} className={inputClass}>
              <option value="active">Active</option>
              <option value="resigned">Resigned</option>
              <option value="terminated">Terminated</option>
              <option value="on_leave">On Leave</option>
            </select>
          </div>
        </div>
      </div>

      {/* Documents */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">Documents</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Nationality</label>
            <input type="text" value={form.nationality} onChange={(e) => set('nationality', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Emirates ID</label>
            <input type="text" value={form.emirates_id} onChange={(e) => set('emirates_id', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Passport Number</label>
            <input type="text" value={form.passport_number} onChange={(e) => set('passport_number', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Passport Expiry</label>
            <input type="date" value={form.passport_expiry_date} onChange={(e) => set('passport_expiry_date', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Visa Number</label>
            <input type="text" value={form.visa_number} onChange={(e) => set('visa_number', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Visa Expiry</label>
            <input type="date" value={form.visa_expiry_date} onChange={(e) => set('visa_expiry_date', e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      {/* Salary */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">Salary</p>
        <div className="grid grid-cols-2 gap-3">
          <div key="basic_salary">
            <label className={labelClass}>Basic Salary</label>
            <input type="number" min="0" step="0.01" value={form.basic_salary}
              onChange={(e) => set('basic_salary', e.target.value)} className={`${inputClass} text-right`} />
          </div>
          <div key="food_allowance">
            <label className={labelClass}>Food Allowance</label>
            <input type="number" min="0" step="0.01" value={form.food_allowance}
              onChange={(e) => set('food_allowance', e.target.value)} className={`${inputClass} text-right`} />
          </div>
          {/* Named allowance — name + amount side by side */}
          <div>
            <label className={labelClass}>Allowance Name</label>
            <input type="text" value={form.allowance_name}
              onChange={(e) => set('allowance_name', e.target.value)}
              placeholder="e.g. Fuel Allowance"
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Allowance Amount</label>
            <input type="number" min="0" step="0.01" value={form.other_allowance}
              onChange={(e) => set('other_allowance', e.target.value)} className={`${inputClass} text-right`} />
          </div>
          <div key="fixed_overtime_monthly" className="col-span-2">
            <label className={labelClass}>Fixed OT (Monthly)</label>
            <input type="number" min="0" step="0.01" value={form.fixed_overtime_monthly}
              onChange={(e) => set('fixed_overtime_monthly', e.target.value)} className={`${inputClass} text-right`} />
            <p className="text-xs text-slate-400 mt-1">Deducted proportionally if absent days are entered during payroll</p>
          </div>
          <div className="col-span-2 flex items-center gap-2 mt-1">
            <input type="checkbox" id="ot_eligible" checked={form.overtime_eligible}
              onChange={(e) => set('overtime_eligible', e.target.checked)}
              className="w-4 h-4 accent-blue-600" />
            <label htmlFor="ot_eligible" className="text-sm text-slate-700">Overtime eligible</label>
          </div>
        </div>
      </div>

      {/* Bank */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">Banking</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Bank Name</label>
            <input type="text" value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>IBAN</label>
            <input type="text" value={form.iban} onChange={(e) => set('iban', e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className={labelClass}>Notes</label>
        <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} className={inputClass} />
      </div>

      <button type="submit" disabled={loading}
        className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
        {loading ? 'Saving…' : 'Save Changes'}
      </button>
    </form>
  )
}
