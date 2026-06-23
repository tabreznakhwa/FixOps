import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { ALL_MODULES, LOCKED_ROLES, ALL_ROLES, type ModuleKey, type Permission } from '@/lib/permissions'

const VALID_PERMISSIONS: Permission[] = ['full', 'view', 'none']

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: actorRaw } = await (supabase as any)
      .from('users')
      .select('role, organization_id, full_name')
      .eq('id', user.id)
      .single()
    const actor = actorRaw as { role: string; organization_id: string; full_name: string } | null

    if (!actor || !['owner', 'admin'].includes(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { role, module, permission } = await request.json() as {
      role: string; module: ModuleKey; permission: Permission
    }

    if (!ALL_ROLES.includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    if (!ALL_MODULES.includes(module)) return NextResponse.json({ error: 'Invalid module' }, { status: 400 })
    if (!VALID_PERMISSIONS.includes(permission)) return NextResponse.json({ error: 'Invalid permission' }, { status: 400 })
    if (LOCKED_ROLES.includes(role)) return NextResponse.json({ error: 'Cannot restrict locked roles' }, { status: 400 })

    const admin = createAdminClient() as any
    const { error } = await admin
      .from('role_permissions')
      .upsert(
        { organization_id: actor.organization_id, role, module, permission },
        { onConflict: 'organization_id,role,module' }
      )

    if (error) throw error

    await logAudit({
      orgId: actor.organization_id,
      userId: user.id,
      userName: actor.full_name,
      action: 'update',
      entityType: 'role_permission',
      entityLabel: `${role} → ${module}`,
      changes: { permission: { before: '?', after: permission } },
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
