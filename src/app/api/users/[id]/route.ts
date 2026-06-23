import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { ALL_ROLES } from '@/lib/permissions'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params
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

    const body = await request.json()
    const { role, status } = body as { role?: string; status?: string }

    if (role && !ALL_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    if (status && !['active', 'inactive'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const admin = createAdminClient() as any
    const { data: targetRaw } = await admin.from('users').select('full_name, role, status').eq('id', targetUserId).single()
    const target = targetRaw as { full_name: string; role: string; status: string } | null
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const updates: Record<string, string> = {}
    if (role) updates.role = role
    if (status) updates.status = status

    const { error } = await admin.from('users').update(updates).eq('id', targetUserId)
    if (error) throw error

    const changes: Record<string, { before: unknown; after: unknown }> = {}
    if (role && role !== target.role) changes.role = { before: target.role, after: role }
    if (status && status !== target.status) changes.status = { before: target.status, after: status }

    await logAudit({
      orgId: actor.organization_id,
      userId: user.id,
      userName: actor.full_name,
      action: 'update',
      entityType: 'user',
      entityId: targetUserId,
      entityLabel: target.full_name,
      changes,
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params
    const { pathname } = request.nextUrl
    const action = pathname.endsWith('/approve') ? 'approve' : pathname.endsWith('/reject') ? 'reject' : null
    if (!action) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

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

    const admin = createAdminClient() as any
    const { data: targetRaw } = await admin.from('users').select('full_name').eq('id', targetUserId).single()

    const newStatus = action === 'approve' ? 'active' : 'rejected'
    const { error } = await admin.from('users').update({ status: newStatus }).eq('id', targetUserId)
    if (error) throw error

    await logAudit({
      orgId: actor.organization_id,
      userId: user.id,
      userName: actor.full_name,
      action,
      entityType: 'user',
      entityId: targetUserId,
      entityLabel: (targetRaw as any)?.full_name ?? targetUserId,
    })

    return NextResponse.redirect(new URL('/settings', request.url))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
