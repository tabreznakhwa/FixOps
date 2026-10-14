import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export async function PATCH(request: NextRequest, context: RouteContext<'/api/leave-applications/[id]'>) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params
    const body = await request.json()
    if (body.action !== 'cancel') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any
    const { data: profile } = await admin
      .from('users')
      .select('organization_id, full_name, status')
      .eq('id', user.id)
      .single()

    if (!profile || profile.status !== 'active' || !profile.organization_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: staff } = await admin
      .from('staff')
      .select('id, organization_id, full_name')
      .eq('organization_id', profile.organization_id)
      .eq('user_id', user.id)
      .eq('employment_status', 'active')
      .maybeSingle()

    if (!staff) {
      return NextResponse.json({ error: 'Your login is not linked to an active staff profile' }, { status: 403 })
    }

    const { data: existing } = await admin
      .from('leave_applications')
      .select('*')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .eq('staff_id', staff.id)
      .maybeSingle()

    if (!existing) return NextResponse.json({ error: 'Leave application not found' }, { status: 404 })
    if (existing.status !== 'pending') {
      return NextResponse.json({ error: 'Only a pending leave application can be cancelled' }, { status: 409 })
    }

    const { data, error } = await admin
      .from('leave_applications')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .eq('staff_id', staff.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 409 })
    if (!data) {
      return NextResponse.json({ error: 'This leave application is no longer pending' }, { status: 409 })
    }

    await logAudit({
      orgId: profile.organization_id,
      userId: user.id,
      userName: profile.full_name,
      action: 'status_change',
      entityType: 'leave_application',
      entityId: id,
      entityLabel: `${staff.full_name}: ${existing.start_date} to ${existing.end_date}`,
      changes: { status: { before: 'pending', after: 'cancelled' } },
    })

    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error('Cancel leave application error:', error)
    return NextResponse.json({ error: 'Unable to cancel the leave application' }, { status: 500 })
  }
}
