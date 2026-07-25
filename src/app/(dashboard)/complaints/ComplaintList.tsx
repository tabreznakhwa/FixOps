'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle, GripVertical, Loader2, MessageSquare, RotateCcw, Save } from 'lucide-react'
import { getPriorityColor, getStatusColor, formatStatus, formatDateTime, formatDate } from '@/lib/utils'

export interface ComplaintListItem {
  id: string
  complaint_number: string
  description: string
  priority: string
  status: string
  service_category: string | string[]
  created_at: string
  preferred_date: string | null
  preferred_time: string | null
  customer_id: string | null
  visit_order: number | null
  customers: { full_name: string; mobile_number: string } | null
  users: { full_name: string } | null
  internalNotesCount?: number
  latestInternalNote?: string | null
  latestInternalNoteAuthor?: string | null
  workOrdersStatuses?: string[]
}

interface Props {
  complaints: ComplaintListItem[]
  isTechnician: boolean
  canReorder: boolean
}

const categoryIcons: Record<string, string> = {
  ac_maintenance: '❄️', plumbing: '🔧', electrical: '⚡',
  general: '🔨', emergency: '🚨', amc_visit: '📋',
  installation: '🏗️', inspection: '🔍', quotation: '📝',
}

const statusStyles: Record<string, string> = {
  new: 'border-l-purple-500 bg-purple-50/60 hover:bg-purple-50',
  assigned: 'border-l-blue-500 bg-blue-50/60 hover:bg-blue-50',
  accepted: 'border-l-indigo-500 bg-indigo-50/60 hover:bg-indigo-50',
  on_the_way: 'border-l-cyan-500 bg-cyan-50/60 hover:bg-cyan-50',
  work_started: 'border-l-teal-500 bg-teal-50/60 hover:bg-teal-50',
  waiting_parts: 'border-l-orange-500 bg-orange-50/70 hover:bg-orange-50',
  waiting_approval: 'border-l-amber-500 bg-amber-50/70 hover:bg-amber-50',
  completed: 'border-l-green-500 bg-green-50/60 hover:bg-green-50',
  verified: 'border-l-emerald-500 bg-emerald-50/60 hover:bg-emerald-50',
  cancelled: 'border-l-red-500 bg-red-50/60 hover:bg-red-50',
  reopened: 'border-l-rose-500 bg-rose-50/60 hover:bg-rose-50',
}

function isCompleted(c: ComplaintListItem) {
  return c.status === 'completed'
}

function sortForTechnicianSequence(items: ComplaintListItem[]) {
  return [...items].sort((a, b) => {
    const aCompleted = isCompleted(a) ? 1 : 0
    const bCompleted = isCompleted(b) ? 1 : 0
    if (aCompleted !== bCompleted) return aCompleted - bCompleted
    if (a.visit_order == null && b.visit_order == null) return b.created_at.localeCompare(a.created_at)
    if (a.visit_order == null) return 1
    if (b.visit_order == null) return -1
    if (a.visit_order !== b.visit_order) return a.visit_order - b.visit_order
    return b.created_at.localeCompare(a.created_at)
  })
}

function move<T>(items: T[], from: number, to: number) {
  const copy = [...items]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

export function ComplaintList({ complaints, isTechnician, canReorder }: Props) {
  const router = useRouter()
  const useSequenceView = isTechnician || canReorder
  const initialRows = useMemo(
    () => useSequenceView ? sortForTechnicianSequence(complaints) : complaints,
    [complaints, useSequenceView]
  )
  const [rows, setRows] = useState(initialRows)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const activeRows = rows.filter(c => !isCompleted(c))
  const completedRows = rows.filter(isCompleted)

  function handleDrop(targetId: string) {
    if (!canReorder || !draggingId || draggingId === targetId) return

    const from = activeRows.findIndex(c => c.id === draggingId)
    const to = activeRows.findIndex(c => c.id === targetId)
    if (from < 0 || to < 0) return

    const reorderedActive = move(activeRows, from, to).map((c, index) => ({
      ...c,
      visit_order: index + 1,
    }))
    setRows([...reorderedActive, ...completedRows])
    setDirty(true)
    setDraggingId(null)
    setDragOverId(null)
    setError('')
  }

  async function saveSequence() {
    setSaving(true)
    setError('')
    try {
      const active = rows.filter(c => !isCompleted(c))
      for (const [index, c] of active.entries()) {
        const res = await fetch(`/api/complaints/${c.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visit_order: index + 1 }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? `Failed to save ${c.complaint_number}`)
      }
      setDirty(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sequence')
    } finally {
      setSaving(false)
    }
  }

  function resetOrder() {
    setRows(initialRows)
    setDirty(false)
    setError('')
  }

  if (!rows.length) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">No complaints found</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {canReorder && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-900">Technician visit sequence</p>
            <p className="text-xs text-blue-700">Drag active complaints to set the order technicians will follow. Completed complaints stay at the bottom.</p>
          </div>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-600 font-medium">{error}</span>}
            {dirty && (
              <button
                type="button"
                onClick={resetOrder}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-blue-200 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-50 disabled:opacity-60 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
            )}
            <button
              type="button"
              onClick={saveSequence}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Sequence
            </button>
          </div>
        </div>
      )}

      {rows.map((c) => {
        const customer = c.customers
        const assignee = c.users
        const completed = isCompleted(c)
        const style = statusStyles[c.status] ?? 'border-l-slate-400 bg-white hover:bg-slate-50'
        const firstCategory = Array.isArray(c.service_category) ? c.service_category[0] : c.service_category ?? ''
        const canDragRow = canReorder && !completed

        return (
          <div
            key={c.id}
            onDragOver={(e) => {
              if (!canDragRow) return
              e.preventDefault()
              setDragOverId(c.id)
            }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={() => handleDrop(c.id)}
            className={`flex items-start gap-4 rounded-xl border border-slate-200 border-l-4 p-4 shadow-sm transition-all group ${style} ${completed ? 'opacity-75' : ''} ${dragOverId === c.id ? 'ring-2 ring-blue-300 scale-[1.005]' : ''}`}
          >
            <div className="flex flex-col items-center gap-2 flex-shrink-0 mt-0.5 w-11">
              {canDragRow ? (
                <button
                  type="button"
                  draggable
                  onDragStart={() => setDraggingId(c.id)}
                  onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
                  className={`w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:border-blue-300 cursor-grab active:cursor-grabbing flex items-center justify-center transition ${draggingId === c.id ? 'opacity-50' : ''}`}
                  title="Drag to change technician sequence"
                >
                  <GripVertical className="w-4 h-4" />
                </button>
              ) : completed ? (
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-green-600 text-white shadow-sm">
                  <CheckCircle className="w-5 h-5" />
                </span>
              ) : c.visit_order != null ? (
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600 text-white text-base font-bold shadow-sm">
                  {c.visit_order}
                </span>
              ) : (
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 text-slate-400 text-sm font-bold">
                  —
                </span>
              )}
              {canReorder && !completed && (
                <span className="text-[10px] font-bold text-slate-400">#{c.visit_order ?? '—'}</span>
              )}
              <div className="text-xl leading-none">{categoryIcons[firstCategory] ?? '🔧'}</div>
            </div>

            <Link href={`/complaints/${c.id}`} className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-mono text-slate-500">{c.complaint_number}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getPriorityColor(c.priority)}`}>
                  {c.priority}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(c.status)}`}>
                  {formatStatus(c.status)}
                </span>
                {(c.internalNotesCount ?? 0) > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                    💬 {c.internalNotesCount} note{c.internalNotesCount !== 1 ? 's' : ''}
                  </span>
                )}
                {(c.workOrdersStatuses?.length ?? 0) > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                    ✓ {c.workOrdersStatuses?.length} WO
                  </span>
                )}
                <span className="text-xs text-slate-500 capitalize">
                  {(Array.isArray(c.service_category) ? c.service_category : [c.service_category ?? ''])
                    .filter(Boolean).map((s: string) => s.replace(/_/g, ' ')).join(' · ')}
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors line-clamp-1">
                {c.description}
              </p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-600 flex-wrap">
                <span>👤 {customer?.full_name ?? 'No customer'}</span>
                {assignee && <span>🔧 {assignee.full_name}</span>}
                <span>🕒 {formatDateTime(c.created_at)}</span>
                {c.preferred_date && (
                  <span className="flex items-center gap-1 bg-white/70 text-amber-700 font-semibold px-2 py-0.5 rounded-full border border-amber-100">
                    📅 {formatDate(c.preferred_date)}{c.preferred_time ? ` ${c.preferred_time}` : ''}
                  </span>
                )}
              </div>

              {/* Show latest internal note inline for actionable statuses */}
              {(c.status === 'waiting_parts' || c.status === 'waiting_approval') && c.latestInternalNote && (
                <div className="mt-2 flex items-start gap-2 bg-white/70 border border-slate-200 rounded-lg px-3 py-2">
                  <span className="text-slate-400 text-xs mt-0.5 flex-shrink-0">💬</span>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-700 leading-snug line-clamp-2">{c.latestInternalNote}</p>
                    {c.latestInternalNoteAuthor && (
                      <p className="text-xs text-slate-400 mt-0.5">— {c.latestInternalNoteAuthor}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Show work order statuses inline */}
              {(c.workOrdersStatuses?.length ?? 0) > 0 && (
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  {c.workOrdersStatuses!.map((s, i) => (
                    <span key={i} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(s)}`}>
                      WO: {formatStatus(s)}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          </div>
        )
      })}
    </div>
  )
}
