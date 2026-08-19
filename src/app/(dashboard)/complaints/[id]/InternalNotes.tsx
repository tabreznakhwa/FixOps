'use client'

import { useState } from 'react'
import { Lock, Send, Loader2, Pencil, Check, X } from 'lucide-react'

interface Note {
  id: string
  note: string
  author_name: string
  created_at: string
  created_by: string | null
  updated_at: string | null
}

interface Props {
  complaintId: string
  initialNotes: Note[]
  currentUserId: string | null
  canEditAnyNote: boolean
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function InternalNotes({ complaintId, initialNotes, currentUserId, canEditAnyNote }: Props) {
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/complaints/${complaintId}/internal-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: text.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to add note')
      setNotes(prev => [data, ...prev])
      setText('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add note')
    } finally {
      setLoading(false)
    }
  }

  function startEdit(n: Note) {
    setEditingId(n.id)
    setEditText(n.note)
    setEditError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditText('')
    setEditError('')
  }

  async function saveEdit(noteId: string) {
    if (!editText.trim()) return
    setEditError('')
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/complaints/${complaintId}/internal-notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId, note: editText.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update note')
      setNotes(prev => prev.map(n => (n.id === noteId ? data : n)))
      setEditingId(null)
      setEditText('')
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to update note')
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Lock className="w-4 h-4 text-amber-600" />
        <h2 className="font-semibold text-amber-900">Internal Notes</h2>
        <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full font-medium">Staff only</span>
      </div>

      {/* Add note form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add a handover note — e.g. Parts ordered from Al Ghanim ETA 2 days, or Customer wants call before visit…"
          rows={3}
          className="w-full border border-amber-200 bg-white rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Add Note
        </button>
      </form>

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="text-sm text-amber-700 italic">No internal notes yet. Add one to help the next technician.</p>
      ) : (
        <div className="space-y-3">
          {notes.map(n => {
            const canEdit = canEditAnyNote || (currentUserId !== null && n.created_by === currentUserId)
            const isEditing = editingId === n.id

            return (
              <div key={n.id} className="bg-white border border-amber-100 rounded-lg px-4 py-3">
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={3}
                      autoFocus
                      className="w-full border border-amber-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                    />
                    {editError && <p className="text-xs text-red-600">{editError}</p>}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(n.id)}
                        disabled={savingEdit || !editText.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
                      >
                        {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={savingEdit}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-600 text-xs font-semibold rounded-lg transition"
                      >
                        <X className="w-3 h-3" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-slate-800 whitespace-pre-wrap flex-1">{n.note}</p>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => startEdit(n)}
                          className="flex-shrink-0 text-slate-400 hover:text-amber-600 transition"
                          title="Edit note"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5">
                      <span className="font-semibold text-slate-500">{n.author_name}</span>
                      {' · '}{timeAgo(n.created_at)}
                      {' · '}{new Date(n.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Kuwait', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {n.updated_at && <span className="italic"> · (edited)</span>}
                    </p>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
