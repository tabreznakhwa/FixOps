'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Unlink } from 'lucide-react'

interface UserOption {
  id: string
  full_name: string
  role: string
}

export function StaffLoginLink({
  staffId, linkedUser, availableUsers,
}: {
  staffId: string
  linkedUser: UserOption | null
  availableUsers: UserOption[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function setLink(userId: string | null) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to update'); return }
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900">Login Account</h3>
      </div>
      <div className="p-5 space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        {linkedUser ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">{linkedUser.full_name}</p>
              <p className="text-xs text-slate-500 capitalize">{linkedUser.role}</p>
            </div>
            <button
              onClick={() => setLink(null)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 transition-colors"
            >
              <Unlink className="w-3.5 h-3.5" /> Unlink
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              Link this staff member to a login account so attendance clock-in/out and self-service features apply to them.
            </p>
            <div className="flex items-center gap-2">
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Select login account…</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name} — {u.role}</option>
                ))}
              </select>
              <button
                onClick={() => selected && setLink(selected)}
                disabled={!selected || loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                Link
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
