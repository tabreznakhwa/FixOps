import { createAdminClient } from './supabase/server'

export type AuditAction =
  | 'create' | 'update' | 'delete' | 'status_change'
  | 'login' | 'logout' | 'approve' | 'reject'
  | 'export' | 'print' | 'process_payroll' | 'convert'

export interface AuditParams {
  orgId: string
  userId: string
  userName?: string
  action: AuditAction
  entityType: string
  entityId?: string
  entityLabel?: string
  changes?: Record<string, { before: unknown; after: unknown }>
}

type AuditLogInsertClient = {
  from(table: 'audit_logs'): {
    insert(values: Record<string, unknown>): Promise<unknown>
  }
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const admin = createAdminClient() as unknown as AuditLogInsertClient
    await admin.from('audit_logs').insert({
      organization_id: params.orgId,
      user_id: params.userId,
      user_name: params.userName,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      entity_label: params.entityLabel,
      changes: params.changes ?? null,
    })
  } catch {
    // Audit logging must never break the main operation
  }
}
