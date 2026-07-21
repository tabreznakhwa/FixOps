'use client'

import { useState } from 'react'
import { Lock, Send, Loader2 } from 'lucide-react'

interface Note {
  id: string
  note: string
  author_name: string
  created_at: string
}

interface Props {
  complaintId: string
  initialNotes: Note[]
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

export function InternalNotes({ complaintId, initialNotes }: Props) {
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
          {notes.map(n => (
            <div key={n.id} className="bg-white border border-amber-100 rounded-lg px-4 py-3">
              <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.note}</p>
              <p className="text-xs text-slate-400 mt-1.5">
                <span className="font-semibold text-slate-500">{n.author_name}</span>
                {' · '}{timeAgo(n.created_at)}
                {' · '}{new Date(n.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Kuwait', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
