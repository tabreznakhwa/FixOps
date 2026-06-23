'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench, Phone, Mail, MapPin, Calendar, AlertCircle, ChevronDown, Loader2, CheckCircle2 } from 'lucide-react'

const SERVICE_CATEGORIES = [
  { value: 'ac_maintenance', label: '❄️ AC Maintenance', desc: 'Cooling, servicing, repair' },
  { value: 'plumbing', label: '🔧 Plumbing', desc: 'Leaks, pipes, drainage' },
  { value: 'electrical', label: '⚡ Electrical', desc: 'Wiring, fuses, sockets' },
  { value: 'installation', label: '🏗️ Installation', desc: 'New equipment fitting' },
  { value: 'inspection', label: '🔍 Inspection', desc: 'Check-up & assessment' },
  { value: 'general', label: '🔨 General', desc: 'Other maintenance' },
  { value: 'emergency', label: '🚨 Emergency', desc: 'Urgent — need help now' },
  { value: 'quotation', label: '📝 Quotation', desc: 'Price estimate only' },
]

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'bg-slate-100 border-slate-300 text-slate-700', active: 'bg-slate-600 border-slate-600 text-white', desc: 'When convenient' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-50 border-blue-200 text-blue-700', active: 'bg-blue-600 border-blue-600 text-white', desc: 'Within 2-3 days' },
  { value: 'high', label: 'High', color: 'bg-orange-50 border-orange-200 text-orange-700', active: 'bg-orange-500 border-orange-500 text-white', desc: 'Within 24 hours' },
  { value: 'emergency', label: 'Emergency', color: 'bg-red-50 border-red-200 text-red-700', active: 'bg-red-600 border-red-600 text-white', desc: 'ASAP — urgent' },
]

interface FormData {
  customerName: string
  customerMobile: string
  customerEmail: string
  serviceCategory: string
  priority: string
  description: string
  location: string
  preferredDate: string
}

const initialForm: FormData = {
  customerName: '',
  customerMobile: '',
  customerEmail: '',
  serviceCategory: '',
  priority: 'medium',
  description: '',
  location: '',
  preferredDate: '',
}

export default function PortalPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormData>(initialForm)
  const [errors, setErrors] = useState<Partial<FormData>>({})
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }))
  }

  const validate = () => {
    const errs: Partial<FormData> = {}
    if (!form.customerName.trim()) errs.customerName = 'Name is required'
    if (!form.customerMobile.trim()) errs.customerMobile = 'Mobile number is required'
    else if (!/^\+?[\d\s\-]{7,15}$/.test(form.customerMobile)) errs.customerMobile = 'Enter a valid mobile number'
    if (!form.serviceCategory) errs.serviceCategory = 'Select a service type'
    if (!form.description.trim()) errs.description = 'Please describe your issue'
    else if (form.description.trim().length < 10) errs.description = 'Please provide more detail (at least 10 characters)'
    return errs
  }

  const handleNext = () => {
    if (step === 1) {
      const errs = { ...validate() }
      delete errs.description
      delete errs.location
      delete errs.preferredDate
      if (Object.keys(errs).length) { setErrors(errs); return }
      setStep(2)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/complaints/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/portal/success?ref=${encodeURIComponent(data.complaintNumber)}`)
    } catch (err) {
      console.error(err)
      setErrors({ description: 'Submission failed. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-lg leading-none">FixOps</div>
            <div className="text-blue-300 text-xs mt-0.5">Service Request Portal</div>
          </div>
          {/* Step indicator */}
          <div className="ml-auto flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/40'}`}>1</div>
            <div className={`w-8 h-0.5 ${step === 2 ? 'bg-blue-400' : 'bg-white/20'}`} />
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step === 2 ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/40'}`}>2</div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 pb-24">
        {/* Hero text */}
        <div className="text-center mb-8 animate-fade-in">
          <h1 className="text-2xl font-bold text-white">
            {step === 1 ? 'Request a Service' : 'Describe Your Issue'}
          </h1>
          <p className="text-blue-200 text-sm mt-2">
            {step === 1
              ? 'Tell us who you are and what service you need'
              : 'We\'ll assign the right technician quickly'}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Step 1: Who + What */}
          {step === 1 && (
            <div className="space-y-5 animate-fade-in">
              {/* Contact */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20 space-y-4">
                <h2 className="text-white font-semibold text-sm uppercase tracking-wider opacity-70">Your Contact Info</h2>

                <div>
                  <label className="text-blue-100 text-sm font-medium block mb-1.5">Full Name <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={form.customerName}
                    onChange={set('customerName')}
                    placeholder="e.g. Ahmed Al Mansouri"
                    className={`w-full bg-white/10 border ${errors.customerName ? 'border-red-400' : 'border-white/20'} rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition`}
                  />
                  {errors.customerName && <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.customerName}</p>}
                </div>

                <div>
                  <label className="text-blue-100 text-sm font-medium block mb-1.5">
                    <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />Mobile Number <span className="text-red-400">*</span></span>
                  </label>
                  <input
                    type="tel"
                    value={form.customerMobile}
                    onChange={set('customerMobile')}
                    placeholder="+971 50 000 0000"
                    className={`w-full bg-white/10 border ${errors.customerMobile ? 'border-red-400' : 'border-white/20'} rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition`}
                  />
                  {errors.customerMobile && <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.customerMobile}</p>}
                </div>

                <div>
                  <label className="text-blue-100 text-sm font-medium block mb-1.5">
                    <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />Email <span className="text-white/40 font-normal">(optional)</span></span>
                  </label>
                  <input
                    type="email"
                    value={form.customerEmail}
                    onChange={set('customerEmail')}
                    placeholder="your@email.com"
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition"
                  />
                </div>
              </div>

              {/* Service Category */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20">
                <h2 className="text-white font-semibold text-sm uppercase tracking-wider opacity-70 mb-4">Service Type <span className="text-red-400">*</span></h2>
                {errors.serviceCategory && <p className="text-red-400 text-xs mb-3 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.serviceCategory}</p>}
                <div className="grid grid-cols-2 gap-2.5">
                  {SERVICE_CATEGORIES.map(cat => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => { setForm(f => ({ ...f, serviceCategory: cat.value })); setErrors(e => ({ ...e, serviceCategory: '' })) }}
                      className={`rounded-xl border p-3 text-left transition-all ${form.serviceCategory === cat.value
                        ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-900/40'
                        : 'bg-white/5 border-white/15 hover:bg-white/10'
                        }`}
                    >
                      <div className="text-base mb-1">{cat.label.split(' ')[0]}</div>
                      <div className={`text-xs font-semibold ${form.serviceCategory === cat.value ? 'text-white' : 'text-white/80'}`}>
                        {cat.label.split(' ').slice(1).join(' ')}
                      </div>
                      <div className={`text-[11px] mt-0.5 ${form.serviceCategory === cat.value ? 'text-blue-100' : 'text-white/40'}`}>
                        {cat.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20">
                <h2 className="text-white font-semibold text-sm uppercase tracking-wider opacity-70 mb-4">How Urgent?</h2>
                <div className="grid grid-cols-2 gap-2.5">
                  {PRIORITIES.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, priority: p.value }))}
                      className={`rounded-xl border-2 p-3 text-left transition-all ${form.priority === p.value
                        ? p.active
                        : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10'
                        }`}
                    >
                      <div className="font-bold text-sm">{p.label}</div>
                      <div className="text-[11px] mt-0.5 opacity-75">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleNext}
                className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-900/40 text-base"
              >
                Next — Describe Your Issue →
              </button>
            </div>
          )}

          {/* Step 2: Description + Details */}
          {step === 2 && (
            <div className="space-y-5 animate-fade-in">
              {/* Summary card */}
              <div className="bg-blue-600/30 border border-blue-400/40 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-300 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-white font-semibold text-sm">{form.customerName}</div>
                    <div className="text-blue-200 text-xs">{form.customerMobile} · {SERVICE_CATEGORIES.find(c => c.value === form.serviceCategory)?.label} · {form.priority.toUpperCase()} priority</div>
                  </div>
                  <button type="button" onClick={() => setStep(1)} className="ml-auto text-blue-300 text-xs underline flex-shrink-0">Edit</button>
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20 space-y-4">
                <div>
                  <label className="text-blue-100 text-sm font-medium block mb-1.5">Describe Your Problem <span className="text-red-400">*</span></label>
                  <textarea
                    value={form.description}
                    onChange={set('description')}
                    placeholder="What's the problem? When did it start? Any previous repairs?…"
                    rows={5}
                    className={`w-full bg-white/10 border ${errors.description ? 'border-red-400' : 'border-white/20'} rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition resize-none`}
                  />
                  {errors.description && <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.description}</p>}
                </div>

                <div>
                  <label className="text-blue-100 text-sm font-medium block mb-1.5">
                    <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />Location / Area <span className="text-white/40 font-normal">(optional)</span></span>
                  </label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={set('location')}
                    placeholder="e.g. Dubai Marina, Villa 12, Flat 304"
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition"
                  />
                </div>

                <div>
                  <label className="text-blue-100 text-sm font-medium block mb-1.5">
                    <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Preferred Visit Date <span className="text-white/40 font-normal">(optional)</span></span>
                  </label>
                  <input
                    type="date"
                    value={form.preferredDate}
                    onChange={set('preferredDate')}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition [color-scheme:dark]"
                  />
                </div>
              </div>

              {/* Privacy note */}
              <p className="text-white/30 text-xs text-center px-4">
                Your information is used only to process your service request and will not be shared with third parties.
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 bg-white/10 hover:bg-white/15 text-white font-semibold py-4 rounded-2xl transition border border-white/20"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-[2] bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-900/40 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Submitting…</>
                  ) : (
                    'Submit Request'
                  )}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
