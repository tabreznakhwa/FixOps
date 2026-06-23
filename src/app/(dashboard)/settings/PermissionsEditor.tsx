'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ROLE_LABELS, MODULE_LABELS, LOCKED_ROLES, CONFIGURABLE_ROLES,
  type ModuleKey, type Permission, type ModuleAccess,
} from '@/lib/permissions'

interface Props {
  matrix: Record<string, ModuleAccess>
  editableModules: ModuleKey[]
  tableExists: boolean
}

const PERMISSION_STYLES: Record<Permission, string> = {
  full: 'bg-green-100 text-green-700 hover:bg-green-200',
  view: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  none: 'bg-slate-100 text-slate-400 hover:bg-slate-200',
}

const PERMISSION_CYCLE: Permission[] = ['full', 'view', 'none']

const PERMISSION_LABELS: Record<Permission, string> = {
  full: 'Full',
  view: 'View',
  none: 'None',
}

export function PermissionsEditor({ matrix, editableModules, tableExists }: Props) {
  const router = useRouter()
  const [local, setLocal] = useState<Record<string, ModuleAccess>>(matrix)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function toggle(role: string, module: ModuleKey) {
    const current = local[role]?.[module] ?? 'none'
    const next = PERMISSION_CYCLE[(PERMISSION_CYCLE.indexOf(current) + 1) % 3]
    const key = `${role}:${module}`
    setSaving(key)
    setError('')

    setLocal((prev) => ({
      ...prev,
      [role]: { ...prev[role], [module]: next },
    }))

    try {
      const res = await fetch('/api/permissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, module, permission: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = typeof data.error === 'string' && data.error.startsWith('{')
          ? 'Database table not found — please run the SQL migration shown above first.'
          : (data.error ?? 'Save failed')
        setError(msg)
        // Revert on failure
        setLocal((prev) => ({
          ...prev,
          [role]: { ...prev[role], [module]: current },
        }))
      } else {
        router.refresh()
      }
    } finally {
      setSaving(null)
    }
  }

  return (
    <div>
      {!tableExists && (
        <div className="mx-5 mt-4 mb-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <strong>Database setup required.</strong> Run this SQL in your Supabase SQL Editor to enable custom permissions:
          <pre className="mt-2 text-xs bg-amber-100 rounded p-2 overflow-x-auto font-mono whitespace-pre-wrap">{`CREATE TABLE role_permissions (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  module TEXT NOT NULL,
  permission TEXT NOT NULL DEFAULT 'none',
  PRIMARY KEY (organization_id, role, module)
);
GRANT ALL ON TABLE role_permissions TO service_role, authenticated, anon;`}</pre>
          <p className="mt-1 text-xs text-amber-600">The grid below shows system defaults. Changes will save once the table is created.</p>
        </div>
      )}
      {error && (
        <div className="mx-5 mt-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-36">Role</th>
              {editableModules.map((m) => (
                <th key={m} className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {MODULE_LABELS[m]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {/* Locked roles — always full */}
            {LOCKED_ROLES.map((role) => (
              <tr key={role} className="bg-slate-50/50">
                <td className="px-5 py-3 font-semibold text-slate-500 text-sm">
                  {ROLE_LABELS[role]}
                  <span className="ml-2 text-xs font-normal text-slate-400">(locked)</span>
                </td>
                {editableModules.map((module) => (
                  <td key={module} className="px-3 py-3 text-center">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 cursor-not-allowed opacity-60">
                      Full
                    </span>
                  </td>
                ))}
              </tr>
            ))}

            {/* Configurable roles */}
            {CONFIGURABLE_ROLES.map((role) => (
              <tr key={role} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 font-semibold text-slate-800 text-sm">
                  {ROLE_LABELS[role]}
                </td>
                {editableModules.map((module) => {
                  const perm = local[role]?.[module] ?? 'none'
                  const key = `${role}:${module}`
                  const isSaving = saving === key
                  return (
                    <td key={module} className="px-3 py-3 text-center">
                      <button
                        onClick={() => toggle(role, module)}
                        disabled={isSaving}
                        title={`Click to cycle: Full → View → None`}
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold transition-colors disabled:opacity-50 ${PERMISSION_STYLES[perm]}`}
                      >
                        {isSaving ? '…' : PERMISSION_LABELS[perm]}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400 px-5">
        Click any cell to cycle: <strong>Full</strong> (create/edit/delete) → <strong>View</strong> (read-only) → <strong>None</strong> (no access). Changes take effect immediately.
      </p>
    </div>
  )
}
