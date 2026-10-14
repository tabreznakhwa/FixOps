'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, Loader2, Plus, Stethoscope, XCircle } from 'lucide-react'
import { countLeaveDays, LEAVE_TYPE_LABELS, type LeaveStatus, type LeaveType } from '@/lib/leave'
import { kuwaitISODate } from '@/lib/attendance'
import { formatDate } from '@/lib/utils'

interface LeaveApplication {
  id: string
  leave_type: string
  start_date: string
  end_date: string
  requested_days: number
  reason: string
  status: string
  review_note: string | null
  reviewed_at: string | null
  created_at: string
}

interface Props {
  staffLinked: boolean
  staffId: string | null
  joiningDate: string | null
  initialApplications: LeaveApplication[]
  pendingTotal: number
  approvedThisYearTotal: number
  page: number
  totalPages: number
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

const STATUS_STYLES: Record<LeaveStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
}

export function MyLeaveDashboard({
  staffLinked,
  staffId,
  joiningDate,
  initialApplications,
  pendingTotal,
  approvedThisYearTotal,
  page,
  totalPages,
}: Props) {
  const router = useRouter()
  const [applications, setApplications] = useState(initialApplications)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [form, setForm] = useState({
    leave_type: 'annual_leave' as LeaveType,
    start_date: kuwaitISODate(),
    end_date: kuwaitISODate(),
    reason: '',
  })

  const estimatedDays = useMemo(
    () => countLeaveDays(form.start_date, form.end_date),
    [form.start_date, form.end_date],
  )

  const currentYear = kuwaitISODate().slice(0, 4)
  const [sickDaysUsed, setSickDaysUsed] = useState<number | null>(null)

  useEffect(() => {
    if (!staffId) return
    const controller = new AbortController()
    fetch(`/api/attendance/sick-leave-usage?staff_id=${encodeURIComponent(staffId)}&year=${currentYear}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => { if (typeof data.used === 'number') setSickDaysUsed(data.used) })
      .catch(() => {})
    return () => controller.abort()
  }, [currentYear, staffId])

  function openForm() {
    setForm({ leave_type: 'annual_leave', start_date: kuwaitISODate(), end_date: kuwaitISODate(), reason: '' })
    setIdempotencyKey(crypto.randomUUID())
    setError('')
    setShowForm(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (estimatedDays < 1) {
      setError('Select a date range containing at least one working day')
      return
    }
    if (form.reason.trim().length < 3) {
      setError('Please enter a reason for your leave')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/leave-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, reason: form.reason.trim(), idempotency_key: idempotencyKey }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'Unable to submit the application')
        return
      }
      setApplications((current) => [data, ...current.filter((item) => item.id !== data.id)])
      setIdempotencyKey('')
      setShowForm(false)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function cancel(application: LeaveApplication) {
    if (!confirm(`Cancel your leave application for ${formatDate(application.start_date)} to ${formatDate(application.end_date)}?`)) return
    setCancellingId(application.id)
    try {
      const response = await fetch(`/api/leave-applications/${application.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      const data = await response.json()
      if (!response.ok) {
        alert(data.error ?? 'Unable to cancel the application')
        return
      }
      setApplications((current) => current.map((item) => item.id === application.id ? { ...item, ...data } : item))
      router.refresh()
    } catch {
      alert('Network error. Please try again.')
    } finally {
      setCancellingId(null)
    }
  }

  if (!staffLinked) {
    return (
      <div className="p-6">
        <div className="max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div>
              <h2 className="font-semibold text-amber-900">Staff profile not linked</h2>
              <p className="mt-1 text-sm text-amber-800">Ask an administrator to link this login account to your staff profile before applying for leave.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pending</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{pendingTotal}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Approved this year</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{approvedThisYearTotal}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sick leave used</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{sickDaysUsed === null ? '—' : sickDaysUsed}<span className="ml-1 text-sm font-medium text-slate-400">/ 15 days</span></p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Leave Applications</h2>
            <p className="mt-0.5 text-xs text-slate-500">Fridays are weekly off and are not counted as leave days.</p>
          </div>
          {!showForm && (
            <button onClick={openForm} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
              <Plus className="h-4 w-4" /> Apply for Leave
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={submit} className="space-y-5 border-b border-slate-100 bg-slate-50 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">New Leave Application</h3>
              <button type="button" onClick={() => { setShowForm(false); setError('') }} className="text-sm font-medium text-slate-500 hover:text-slate-700">Close</button>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {(Object.entries(LEAVE_TYPE_LABELS) as Array<[LeaveType, string]>).map(([value, label]) => {
                const Icon = value === 'sick_leave' ? Stethoscope : value === 'compensation_leave' ? Clock3 : CalendarDays
                return (
                  <label key={value} className={`cursor-pointer rounded-xl border p-4 transition ${form.leave_type === value ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <input type="radio" className="sr-only" name="leave_type" value={value} checked={form.leave_type === value} onChange={() => setForm((current) => ({ ...current, leave_type: value }))} />
                    <Icon className={`h-5 w-5 ${form.leave_type === value ? 'text-blue-600' : 'text-slate-400'}`} />
                    <p className="mt-2 text-sm font-semibold text-slate-900">{label}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {value === 'annual_leave' && 'Paid annual leave, subject to admin approval.'}
                      {value === 'sick_leave' && 'Paid sick leave; annual usage is tracked against 15 days.'}
                      {value === 'compensation_leave' && 'Paid time off in compensation for extra duty.'}
                    </p>
                  </label>
                )
              })}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">From</label>
                <input type="date" required min={joiningDate && joiningDate > kuwaitISODate() ? joiningDate : kuwaitISODate()} value={form.start_date} onChange={(e) => setForm((current) => ({ ...current, start_date: e.target.value, end_date: current.end_date < e.target.value ? e.target.value : current.end_date }))} className={inputClass} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">To</label>
                <input type="date" required min={form.start_date} value={form.end_date} onChange={(e) => setForm((current) => ({ ...current, end_date: e.target.value }))} className={inputClass} />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Reason</label>
              <textarea required maxLength={1000} rows={3} value={form.reason} onChange={(e) => setForm((current) => ({ ...current, reason: e.target.value }))} placeholder="Explain why you are requesting leave…" className={inputClass} />
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-900">Estimated: {estimatedDays} working {estimatedDays === 1 ? 'day' : 'days'}</p>
                <p className="mt-0.5 text-xs text-blue-700">This estimate excludes Fridays. The confirmed total also excludes known public holidays and is shown after submission.</p>
              </div>
              <button type="submit" disabled={saving || estimatedDays < 1} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} {saving ? 'Submitting…' : 'Submit Application'}
              </button>
            </div>
          </form>
        )}

        {applications.length === 0 ? (
          <div className="p-10 text-center">
            <CalendarDays className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-600">No leave applications yet</p>
            <p className="mt-1 text-xs text-slate-400">Your applications and approval status will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {applications.map((application) => {
              const status = application.status as LeaveStatus
              return (
                <div key={application.id} className="p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-900">{LEAVE_TYPE_LABELS[application.leave_type as LeaveType]}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[status]}`}>{status}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {formatDate(application.start_date)} – {formatDate(application.end_date)} · {application.requested_days} {application.requested_days === 1 ? 'day' : 'days'}{status === 'pending' ? ' estimated' : ''}
                      </p>
                      {status === 'pending' && (
                        <p className="mt-1 text-xs text-amber-600">The final count is recalculated when your application is approved.</p>
                      )}
                      <p className="mt-2 text-sm text-slate-700">{application.reason}</p>
                      {application.review_note && (
                        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><span className="font-semibold">Admin note:</span> {application.review_note}</p>
                      )}
                    </div>
                    {status === 'pending' && (
                      <button onClick={() => cancel(application)} disabled={cancellingId === application.id} className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-60">
                        {cancellingId === application.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} Cancel
                      </button>
                    )}
                    {status === 'approved' && <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
            <p className="text-xs text-slate-500">Page {page} of {totalPages}</p>
            <div className="flex items-center gap-2">
              {page > 1 && (
                <Link href={page === 2 ? '/my-leave' : `/my-leave?page=${page - 1}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Previous</Link>
              )}
              {page < totalPages && (
                <Link href={`/my-leave?page=${page + 1}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Next</Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
