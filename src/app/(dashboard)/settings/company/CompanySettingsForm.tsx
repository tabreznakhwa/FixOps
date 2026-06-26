'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Upload, Loader2 } from 'lucide-react'

interface Org {
  name: string; email: string | null; phone: string | null
  address: string | null; city: string | null; country: string | null
  currency: string | null; vat_number: string | null; vat_rate: number | null
  logo_url: string | null; bank_name: string | null; bank_account_number: string | null
  bank_iban: string | null; bank_swift: string | null
  opening_cash_balance: number | null; opening_bank_balance: number | null; opening_balance_date: string | null
}

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5'
const sectionTitle = 'text-sm font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100'

export function CompanySettingsForm({ org }: { org: Org }) {
  const [form, setForm] = useState<Org>({ ...org })
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setUploadError('Please select an image file'); return }
    if (file.size > 2 * 1024 * 1024) { setUploadError('Image must be under 2MB'); return }

    setUploading(true)
    setUploadError('')
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `org-logo-${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
      if (uploadErr) throw uploadErr
      const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
      set('logo_url', publicUrl)
      setSaved(false)
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function set(field: keyof Org, value: string | number | null) {
    setForm(prev => ({ ...prev, [field]: value === '' ? null : value }))
    setSaved(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/settings/company', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to save settings'); return }
      setSaved(true)
    } catch { setError('Network error. Please try again.') }
    finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}
      {saved && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">Company settings saved successfully.</p>}

      {/* Company Info */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className={sectionTitle}>Company Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelClass}>Company Name <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required className={inputClass} placeholder="e.g. Al Nour Technical Services" />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} className={inputClass} placeholder="info@company.com" />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input type="tel" value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} className={inputClass} placeholder="+965 2222 3333" />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Address</label>
            <textarea rows={2} value={form.address ?? ''} onChange={e => set('address', e.target.value)} className={`${inputClass} resize-none`} placeholder="Street, Block, Area" />
          </div>
          <div>
            <label className={labelClass}>City</label>
            <input value={form.city ?? ''} onChange={e => set('city', e.target.value)} className={inputClass} placeholder="Kuwait City" />
          </div>
          <div>
            <label className={labelClass}>Country</label>
            <input value={form.country ?? ''} onChange={e => set('country', e.target.value)} className={inputClass} placeholder="Kuwait" />
          </div>
        </div>
      </div>

      {/* Logo */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className={sectionTitle}>Company Logo</h3>
        <div className="flex items-start gap-5">
          <div className="flex-shrink-0">
            {form.logo_url ? (
              <img src={form.logo_url} alt="Logo preview" className="h-20 w-auto max-w-[120px] object-contain border border-slate-200 rounded-lg p-2 bg-white" />
            ) : (
              <div className="w-20 h-20 bg-blue-100 rounded-xl flex items-center justify-center text-blue-700 text-2xl font-bold">
                {form.name?.slice(0, 2).toUpperCase() || '??'}
              </div>
            )}
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <label className={labelClass}>Upload Logo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-60"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Uploading…' : 'Choose Image'}
              </button>
              <p className="text-xs text-slate-400 mt-1.5">PNG, JPG or SVG · max 2 MB · appears on invoices, payslips and reports</p>
              {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
            </div>
            <div>
              <label className={labelClass}>Or paste a URL</label>
              <input value={form.logo_url ?? ''} onChange={e => set('logo_url', e.target.value)} placeholder="https://example.com/logo.png" className={inputClass} />
            </div>
          </div>
        </div>
      </div>

      {/* Tax & Currency */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className={sectionTitle}>Tax & Currency</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Currency</label>
            <select value={form.currency ?? 'KWD'} onChange={e => set('currency', e.target.value)} className={inputClass}>
              <option value="KWD">KWD — Kuwaiti Dinar</option>
              <option value="AED">AED — UAE Dirham</option>
              <option value="SAR">SAR — Saudi Riyal</option>
              <option value="BHD">BHD — Bahraini Dinar</option>
              <option value="OMR">OMR — Omani Rial</option>
              <option value="QAR">QAR — Qatari Riyal</option>
              <option value="USD">USD — US Dollar</option>
              <option value="GBP">GBP — British Pound</option>
              <option value="EUR">EUR — Euro</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>VAT / TRN Number</label>
            <input value={form.vat_number ?? ''} onChange={e => set('vat_number', e.target.value)} className={inputClass} placeholder="e.g. 300000000000003" />
          </div>
          <div>
            <label className={labelClass}>VAT Rate (%)</label>
            <input type="number" step="0.01" min="0" max="100" value={form.vat_rate ?? ''} onChange={e => set('vat_rate', e.target.value ? Number(e.target.value) : null)} className={inputClass} placeholder="e.g. 5" />
          </div>
        </div>
      </div>

      {/* Bank Details */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className={sectionTitle}>Bank Details</h3>
        <p className="text-xs text-slate-500 mb-4">These details appear on invoices and payslips so customers and employees know where to transfer payments.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Bank Name</label>
            <input value={form.bank_name ?? ''} onChange={e => set('bank_name', e.target.value)} className={inputClass} placeholder="e.g. National Bank of Kuwait" />
          </div>
          <div>
            <label className={labelClass}>Account Number</label>
            <input value={form.bank_account_number ?? ''} onChange={e => set('bank_account_number', e.target.value)} className={inputClass} placeholder="e.g. 123456789" />
          </div>
          <div>
            <label className={labelClass}>IBAN</label>
            <input value={form.bank_iban ?? ''} onChange={e => set('bank_iban', e.target.value)} className={inputClass} placeholder="e.g. KW81CBKU0000000000001234560101" />
          </div>
          <div>
            <label className={labelClass}>SWIFT / BIC Code</label>
            <input value={form.bank_swift ?? ''} onChange={e => set('bank_swift', e.target.value)} className={inputClass} placeholder="e.g. NBOKKWKW" />
          </div>
        </div>
      </div>

      {/* Opening Balances */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className={sectionTitle}>Opening Balances</h3>
        <p className="text-xs text-slate-500 mb-4">Set these once before going live. They appear as the starting balance in the Cash Book and Bank Book.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Opening Date</label>
            <input type="date" value={form.opening_balance_date ?? ''}
              onChange={e => set('opening_balance_date', e.target.value || null)}
              className={inputClass} />
            <p className="text-xs text-slate-400 mt-1">Date your books start</p>
          </div>
          <div>
            <label className={labelClass}>Opening Cash Balance (KWD)</label>
            <input type="number" min="0" step="0.001" placeholder="0.000"
              value={form.opening_cash_balance ?? ''}
              onChange={e => set('opening_cash_balance', e.target.value ? Number(e.target.value) : null)}
              className={inputClass} />
            <p className="text-xs text-slate-400 mt-1">Cash in hand on opening date</p>
          </div>
          <div>
            <label className={labelClass}>Opening Bank Balance (KWD)</label>
            <input type="number" min="0" step="0.001" placeholder="0.000"
              value={form.opening_bank_balance ?? ''}
              onChange={e => set('opening_bank_balance', e.target.value ? Number(e.target.value) : null)}
              className={inputClass} />
            <p className="text-xs text-slate-400 mt-1">Bank account balance on opening date</p>
          </div>
        </div>
      </div>

      <button type="submit" disabled={loading}
        className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
        {loading ? 'Saving…' : 'Save Company Settings'}
      </button>
    </form>
  )
}
