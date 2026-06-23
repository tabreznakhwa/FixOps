import { createAdminClient } from './supabase/server'
import {
  DEFAULT_PERMISSIONS, LOCKED_ROLES, ALL_MODULES,
  type Permission, type ModuleKey, type ModuleAccess,
} from './permissions'

function isTableMissing(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as any).code === 'PGRST205'
}

/**
 * Loads the effective module access for a single role in an org.
 * Falls back to DEFAULT_PERMISSIONS if the table doesn't exist yet or has no rows.
 * Locked roles (owner/admin) always return full regardless of DB.
 */
export async function getRoleAccess(orgId: string, role: string): Promise<ModuleAccess> {
  if (LOCKED_ROLES.includes(role)) {
    return { operations: 'full', finance: 'full', hr: 'full', inventory: 'full', reports: 'full', settings: 'full' }
  }

  const defaults = { ...DEFAULT_PERMISSIONS[role] } as ModuleAccess

  try {
    const admin = createAdminClient() as any
    const { data: rows, error } = await admin
      .from('role_permissions')
      .select('module, permission')
      .eq('organization_id', orgId)
      .eq('role', role)

    if (error || !rows) return defaults

    for (const row of rows) {
      if (ALL_MODULES.includes(row.module as ModuleKey)) {
        defaults[row.module as ModuleKey] = row.permission as Permission
      }
    }
  } catch {
    // Table may not exist yet — fall back to hardcoded defaults
  }

  return defaults
}

/**
 * Loads the full permissions matrix for all roles in an org.
 * Returns defaults merged with any DB customisations.
 * Returns { tableExists: false } metadata so the UI can prompt for migration.
 */
export async function getOrgPermissionsMatrix(
  orgId: string
): Promise<{ matrix: Record<string, ModuleAccess>; tableExists: boolean }> {
  const buildDefaults = (): Record<string, ModuleAccess> => {
    const m: Record<string, ModuleAccess> = {}
    for (const role of Object.keys(DEFAULT_PERMISSIONS)) {
      m[role] = { ...DEFAULT_PERMISSIONS[role] } as ModuleAccess
    }
    return m
  }

  try {
    const admin = createAdminClient() as any
    const { data: rows, error } = await admin
      .from('role_permissions')
      .select('role, module, permission')
      .eq('organization_id', orgId)

    if (error) {
      if (isTableMissing(error)) return { matrix: buildDefaults(), tableExists: false }
      return { matrix: buildDefaults(), tableExists: true }
    }

    const dbMap: Record<string, Record<string, Permission>> = {}
    for (const row of (rows ?? [])) {
      if (!dbMap[row.role]) dbMap[row.role] = {}
      dbMap[row.role][row.module] = row.permission as Permission
    }

    const matrix = buildDefaults()
    for (const role of Object.keys(matrix)) {
      matrix[role] = { ...matrix[role], ...(dbMap[role] ?? {}) } as ModuleAccess
    }

    return { matrix, tableExists: true }
  } catch {
    return { matrix: buildDefaults(), tableExists: false }
  }
}
