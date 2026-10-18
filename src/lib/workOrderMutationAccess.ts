import { NextResponse } from 'next/server'
import type { createAdminClient } from '@/lib/supabase/server'
import { isWorkOrderAssignedToTechnician } from '@/lib/workOrderAccess'

const ALLOWED_ROLES = new Set([
  'owner',
  'admin',
  'manager',
  'call_center',
  'technician',
])

export type AuthorizedWorkOrder = {
  organization_id: string
  assigned_to: string | null
  assigned_staff_id: string | null
  status: string
  actorRole: string
}

export async function authorizeWorkOrderMutation(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  workOrderId: string,
): Promise<AuthorizedWorkOrder | NextResponse> {
  const { data: profileRaw } = await admin
    .from('users')
    .select('organization_id, role, status')
    .eq('id', userId)
    .single()
  const profile = profileRaw as {
    organization_id: string | null
    role: string
    status: string
  } | null

  if (
    !profile ||
    profile.status !== 'active' ||
    !profile.organization_id ||
    !ALLOWED_ROLES.has(profile.role)
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: workOrderRaw, error: workOrderError } = await admin
    .from('work_orders')
    .select('organization_id, assigned_to, assigned_staff_id, status')
    .eq('id', workOrderId)
    .eq('organization_id', profile.organization_id)
    .single()
  const workOrder = workOrderRaw as AuthorizedWorkOrder | null

  if (workOrderError || !workOrder) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }

  if (profile.role === 'technician') {
    const { data: ownStaffRaw } = await admin
      .from('staff')
      .select('id')
      .eq('user_id', userId)
      .eq('organization_id', profile.organization_id)
      .eq('employment_status', 'active')
      .maybeSingle()
    const ownStaff = ownStaffRaw as { id: string } | null

    if (!isWorkOrderAssignedToTechnician({
      userId,
      staffId: ownStaff?.id ?? null,
      workOrder,
    })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  return {
    ...workOrder,
    actorRole: profile.role,
  }
}

export function isAuthorizationResponse(
  result: AuthorizedWorkOrder | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse
}
