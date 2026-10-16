'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, CalendarDays, Check, CheckCircle2, Clock3, Loader2, Search, Stethoscope, X } from 'lucide-react'
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, type LeaveStatus, type LeaveType } from '@/lib/leave'
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
  staff: { id: string; staff_code: string; full_name: string } | null
  reviewer: { full_name: string } | null
}

const STATUS_STYLES: Record<LeaveStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
}

interface Props {
  initialApplications: LeaveApplication[]
  pendingPage: number
  pendingPages: number
  historyPage: number
  historyPages: number
  historyTotal: number
  pendingTotal: number
  approvedTotal: number
  sickPendingTotal: number
  initialStatusFilter: 'all' | LeaveStatus
  initialQuery: string
}

export function LeaveApplicationsList({
  initialApplications,
  pendingPage,
  pendingPages,
  historyPage,
  historyPages,
  historyTotal,
  pendingTotal,
  approvedTotal,
  sickPendingTotal,
  initialStatusFilter,
  initialQuery,
}: Props) {
  const router = useRouter()
  const [applications, setApplications] = useState(initialApplications)
  const [query, setQuery] = useState(initialQuery)
  const [reviewing, setReviewing] = useState<{ application: LeaveApplication; decision: 'approved' | 'rejected' } | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const visible = initialStatusFilter === 'pending'
    ? applications.filter((application) => application.status === 'pending')
    : initialStatusFilter === 'all'
      ? applications
      : applications.filter((application) => application.status === initialStatusFilter)

  function filterHref(status: 'all' | LeaveStatus, search = query.trim()) {
    const params = new URLSearchParams()
    if (status !== 'pending') params.set('status', status)
    if (search) params.set('q', search)
    const queryString = params.toString()
    return queryString ? `/leave-applications?${queryString}` : '/leave-applications'
  }

  function pageHref(nextPendingPage: number, nextHistoryPage: number) {
    const params = new URLSearchParams()
    if (nextPendingPage > 1) params.set('pending_page', String(nextPendingPage))
    if (nextHistoryPage > 1) params.set('page', String(nextHistoryPage))
    if (initialStatusFilter !== 'pending') params.set('status', initialStatusFilter)
    if (initialQuery) params.set('q', initialQuery)
    const queryString = params.toString()
    return queryString ? `/leave-applications?${queryString}` : '/leave-applications'
  }

  function beginReview(application: LeaveApplication, decision: 'approved' | 'rejected') {
    setReviewing({ application, decision })
    setReviewNote('')
    setError('')
  }

  async function submitReview() {
    if (!reviewing) return
    if (reviewing.decision === 'rejected' && !reviewNote.trim()) {
      setError('Enter a reason for rejecting this application')
      return
    }

    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/leave-applications/${reviewing.application.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: reviewing.decision, review_note: reviewNote.trim() || null }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'Unable to review the application')
        return
      }
      setApplications((current) => current.map((item) => item.id === reviewing.application.id
        ? { ...item, ...data }
        : item))
      setReviewing(null)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Awaiting review</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{pendingTotal}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Approved</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{approvedTotal}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pending sick leave</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{sickPendingTotal}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(['pending', 'approved', 'rejected', 'cancelled', 'all'] as const).map((status) => (
              <Link key={status} href={filterHref(status)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${initialStatusFilter === status ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {status === 'all' ? 'All' : LEAVE_STATUS_LABELS[status]}
              </Link>
            ))}
          </div>
          <form action="/leave-applications" method="get" className="flex w-full gap-2 lg:w-auto">
            {initialStatusFilter !== 'pending' && <input type="hidden" name="status" value={initialStatusFilter} />}
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input name="q" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee or reason…" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <button type="submit" className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">Search</button>
          </form>
        </div>

        {initialStatusFilter !== 'pending' && (
          <div className="border-b border-slate-100 bg-blue-50/50 px-4 py-2 text-xs text-slate-600">
            Showing {initialStatusFilter === 'all' ? 'pending applications plus matching history' : LEAVE_STATUS_LABELS[initialStatusFilter]} · history page {historyPage} of {historyPages} ({historyTotal} matching reviewed or cancelled applications).
          </div>
        )}

        {visible.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarDays className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-600">No matching leave applications</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map((application) => {
              const status = application.status as LeaveStatus
              const type = application.leave_type as LeaveType
              const Icon = type === 'sick_leave' ? Stethoscope : type === 'compensation_leave' ? Clock3 : CalendarDays
              return (
                <div key={application.id} className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Icon className="h-5 w-5 text-blue-500" />
                        <h3 className="font-semibold text-slate-900">{application.staff?.full_name ?? 'Unknown employee'}</h3>
                        {application.staff?.staff_code && <span className="font-mono text-xs text-slate-400">{application.staff.staff_code}</span>}
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>{LEAVE_STATUS_LABELS[status]}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-700">{LEAVE_TYPE_LABELS[type]}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {formatDate(application.start_date)} – {formatDate(application.end_date)} · {application.requested_days} {application.requested_days === 1 ? 'working day' : 'working days'}
                        {status === 'pending' ? ' estimated' : ''}
                      </p>
                      {status === 'pending' && (
                        <p className="mt-1 text-xs text-amber-600">The final count is recalculated when this application is approved.</p>
                      )}
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{application.reason}</p>
                      <p className="mt-2 text-xs text-slate-400">Submitted {formatDate(application.created_at)}</p>
                      {application.review_note && (
                        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><span className="font-semibold">Review note:</span> {application.review_note}{application.reviewer?.full_name ? ` — ${application.reviewer.full_name}` : ''}</p>
                      )}
                    </div>
                    {status === 'pending' && (
                      <div className="flex flex-shrink-0 gap-2">
                        <button onClick={() => beginReview(application, 'approved')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700">
                          <Check className="h-4 w-4" /> Approve
                        </button>
                        <button onClick={() => beginReview(application, 'rejected')} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50">
                          <X className="h-4 w-4" /> Reject
                        </button>
                      </div>
                    )}
                    {status === 'approved' && <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-emerald-500" />}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {pendingPages > 1 && (initialStatusFilter === 'pending' || initialStatusFilter === 'all') && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
            <p className="text-xs text-slate-500">Pending page {pendingPage} of {pendingPages}</p>
            <div className="flex items-center gap-2">
              {pendingPage > 1 && (
                <Link href={pageHref(pendingPage - 1, historyPage)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Previous</Link>
              )}
              {pendingPage < pendingPages && (
                <Link href={pageHref(pendingPage + 1, historyPage)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Next</Link>
              )}
            </div>
          </div>
        )}

        {historyPages > 1 && initialStatusFilter !== 'pending' && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
            <p className="text-xs text-slate-500">History page {historyPage} of {historyPages}</p>
            <div className="flex items-center gap-2">
              {historyPage > 1 && (
                <Link href={pageHref(pendingPage, historyPage - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Previous</Link>
              )}
              {historyPage < historyPages && (
                <Link href={pageHref(pendingPage, historyPage + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Next</Link>
              )}
            </div>
          </div>
        )}
      </div>

      {reviewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{reviewing.decision === 'approved' ? 'Approve Leave' : 'Reject Leave'}</h2>
                <p className="mt-1 text-sm text-slate-600">{reviewing.application.staff?.full_name} · {formatDate(reviewing.application.start_date)} to {formatDate(reviewing.application.end_date)}</p>
              </div>
              <button onClick={() => setReviewing(null)} disabled={saving} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>

            {reviewing.decision === 'approved' && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                Approval will add paid leave to attendance for each working day. Existing worked attendance will block approval rather than be overwritten.
              </div>
            )}

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {error}
              </div>
            )}

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">{reviewing.decision === 'rejected' ? 'Reason for rejection' : 'Admin note (optional)'}</label>
              <textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={4} maxLength={1000} placeholder={reviewing.decision === 'rejected' ? 'Explain why this application is rejected…' : 'Add a note for the employee…'} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>

            <div className="mt-5 flex gap-2">
              <button onClick={submitReview} disabled={saving} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 ${reviewing.decision === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? 'Saving…' : reviewing.decision === 'approved' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
              <button onClick={() => setReviewing(null)} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
