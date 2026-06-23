import { createAdminClient } from './supabase/server'

export type AuditAction =
  | 'create' | 'update' | 'delete' | 'status_change'
  | 'login' | 'logout' | 'approve' | 'reject'
  | 'export' | 'print' | 'process_payroll'

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

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const admin = createAdminClient() as any
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
