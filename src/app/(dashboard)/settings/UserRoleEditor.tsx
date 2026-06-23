'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ROLE_LABELS, ALL_ROLES } from '@/lib/permissions'

interface Props {
  user: { id: string; full_name: string; email: string; role: string; status: string }
  currentUserId: string
}

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-700',
  admin: 'bg-red-100 text-red-700',
  manager: 'bg-blue-100 text-blue-700',
  technician: 'bg-teal-100 text-teal-700',
  accounts: 'bg-green-100 text-green-700',
  call_center: 'bg-slate-100 text-slate-700',
  hr: 'bg-orange-100 text-orange-700',
  store: 'bg-amber-100 text-amber-700',
}

export function UserRoleEditor({ user, currentUserId }: Props) {
  const router = useRouter()
  const [role, setRole] = useState(user.role)
  const [status, setStatus] = useState(user.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isSelf = user.id === currentUserId

  async function update(updates: { role?: string; status?: string }) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      if (updates.role) setRole(updates.role)
      if (updates.status) setStatus(updates.status)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-slate-400 to-slate-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
          {user.full_name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{user.full_name}</p>
          <p className="text-xs text-slate-500">{user.email}</p>
          {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isSelf ? (
          <>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${ROLE_COLORS[role] ?? 'bg-slate-100 text-slate-700'}`}>
              {ROLE_LABELS[role] ?? role}
            </span>
            <span className="text-xs text-slate-400">(you)</span>
          </>
        ) : (
          <>
            <select
              value={role}
              disabled={saving}
              onChange={(e) => update({ role: e.target.value })}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>

            <button
              onClick={() => update({ status: status === 'active' ? 'inactive' : 'active' })}
              disabled={saving}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 ${
                status === 'active'
                  ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                  : 'bg-slate-100 text-slate-500 hover:bg-green-100 hover:text-green-700'
              }`}
              title={status === 'active' ? 'Click to deactivate' : 'Click to activate'}
            >
              {status === 'active' ? 'Active' : 'Inactive'}
            </button>
          </>
        )}
        {saving && <span className="text-xs text-slate-400 animate-pulse">saving…</span>}
      </div>
    </div>
  )
}
