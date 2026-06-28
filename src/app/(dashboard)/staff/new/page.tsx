'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft, Loader2, AlertCircle, ChevronDown } from 'lucide-react'

const DEPARTMENTS = ['Operations', 'Technical', 'Administration', 'Finance', 'HR', 'Store', 'Sales']

export default function NewStaffPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    full_name: '',
    mobile_number: '',
    email: '',
    nationality: '',
    passport_number: '',
    visa_number: '',
    designation: '',
    department: '',
    joining_date: '',
    basic_salary: '',
    food_allowance: '',
    allowance_name: 'Allowance',
    other_allowance: '',
    fixed_overtime_monthly: '',
    visa_expiry_date: '',
    notes: '',
  })

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Full name is required'); return }
    if (!form.joining_date) { setError('Joining date is required'); return }
    if (!form.basic_salary || Number(form.basic_salary) <= 0) { setError('Basic salary is required'); return }

    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          basic_salary: Number(form.basic_salary),
          housing_allowance: 0,
          transport_allowance: 0,
          food_allowance: form.food_allowance ? Number(form.food_allowance) : 0,
          allowance_name: form.allowance_name || 'Allowance',
          other_allowance: form.other_allowance ? Number(form.other_allowance) : 0,
          fixed_overtime_monthly: form.fixed_overtime_monthly ? Number(form.fixed_overtime_monthly) : 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push('/staff')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add staff member')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white'
  const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'
  const req = <span className="text-red-500 ml-0.5">*</span>

  return (
    <div className="animate-fade-in">
      <Header
        title="Add Staff Member"
        subtitle="Create a new employee record"
        actions={
          <Link href="/staff" className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />

      <div className="p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Personal Info */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h2 className="font-semibold text-slate-900">Personal Information</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelClass}>Full Name {req}</label>
                <input type="text" value={form.full_name} onChange={set('full_name')} placeholder="e.g. Ahmad Al Rashidi" className={inputClass} />
              </div>

              <div>
                <label className={labelClass}>Mobile Number</label>
                <input type="tel" value={form.mobile_number} onChange={set('mobile_number')} placeholder="+971 50 000 0000" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input type="email" value={form.email} onChange={set('email')} placeholder="email@company.com" className={inputClass} />
              </div>

              <div>
                <label className={labelClass}>Nationality</label>
                <input type="text" value={form.nationality} onChange={set('nationality')} placeholder="e.g. Indian, Pakistani" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Passport Number</label>
                <input type="text" value={form.passport_number} onChange={set('passport_number')} placeholder="e.g. A1234567" className={inputClass} />
              </div>

              <div>
                <label className={labelClass}>Visa Number</label>
                <input type="text" value={form.visa_number} onChange={set('visa_number')} placeholder="e.g. 201/2024/12345" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Visa Expiry Date</label>
                <input type="date" value={form.visa_expiry_date} onChange={set('visa_expiry_date')} className={inputClass} />
              </div>
            </div>
          </div>

          {/* Job Details */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h2 className="font-semibold text-slate-900">Job Details</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Designation</label>
                <input type="text" value={form.designation} onChange={set('designation')} placeholder="e.g. AC Technician" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Department</label>
                <div className="relative">
                  <select value={form.department} onChange={set('department')} className={inputClass + ' appearance-none pr-9'}>
                    <option value="">Select department</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className={labelClass}>Joining Date {req}</label>
                <input type="date" value={form.joining_date} onChange={set('joining_date')} className={inputClass} />
              </div>
            </div>
          </div>

          {/* Salary */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h2 className="font-semibold text-slate-900">Salary & Allowances (KWD)</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Basic Salary {req}</label>
                <input type="number" min="0" step="0.001" value={form.basic_salary} onChange={set('basic_salary')} placeholder="0.000" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Food Allowance</label>
                <input type="number" min="0" step="0.001" value={form.food_allowance} onChange={set('food_allowance')} placeholder="0.000" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Allowance Name</label>
                <input type="text" value={form.allowance_name} onChange={set('allowance_name')} placeholder="e.g. Fuel Allowance" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Allowance Amount</label>
                <input type="number" min="0" step="0.001" value={form.other_allowance} onChange={set('other_allowance')} placeholder="0.000" className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Fixed Overtime (KWD/month)</label>
                <input type="number" min="0" step="0.001" value={form.fixed_overtime_monthly} onChange={set('fixed_overtime_monthly')} placeholder="0.000" className={inputClass} />
                <p className="text-xs text-slate-400 mt-1">Fixed monthly OT — deducted proportionally for absent days</p>
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg border border-blue-100 px-4 py-3 mt-2">
              <p className="text-xs text-slate-500 mb-0.5">Total Monthly Package</p>
              <p className="text-xl font-bold text-slate-900">
                KWD {(
                  (Number(form.basic_salary) || 0) +
                  (Number(form.food_allowance) || 0) +
                  (Number(form.other_allowance) || 0) +
                  (Number(form.fixed_overtime_monthly) || 0)
                ).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </p>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <label className={labelClass}>Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="Any additional notes about this employee…" className={inputClass + ' resize-none'} />
          </div>

          <div className="flex items-center justify-end gap-3 pb-6">
            <button type="button" onClick={() => router.back()} className="px-5 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding…</> : 'Add Staff Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
