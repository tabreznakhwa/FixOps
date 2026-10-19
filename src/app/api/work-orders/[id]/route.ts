import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { isWorkOrderAssignedToTechnician } from '@/lib/workOrderAccess'

/* eslint-disable @typescript-eslint/no-explicit-any */

// When WO status advances, sync the linked complaint to the same stage
const WO_TO_COMPLAINT_STATUS: Record<string, string> = {
  assigned: 'assigned',
  work_started: 'work_started',
  waiting_parts: 'waiting_parts',
  completed: 'completed',
}

const PRIVILEGED_FIELDS = new Set([
  'status',
  'assigned_to',
  'assigned_staff_id',
  'priority',
  'notes',
  'final_amount',
  'payment_status',
  'scheduled_date',
  'scheduled_time',
  'service_category',
])
const TECHNICIAN_FIELDS = new Set(['status', 'notes'])
const TECHNICIAN_STATUS_TRANSITIONS: Record<string, Set<string>> = {
  new: new Set(['accepted']),
  assigned: new Set(['accepted']),
  accepted: new Set(['on_the_way']),
  on_the_way: new Set(['work_started']),
  work_started: new Set(['waiting_parts', 'waiting_approval', 'completed']),
  waiting_parts: new Set(['work_started', 'waiting_approval', 'completed']),
  waiting_approval: new Set(['work_started', 'completed']),
}

type ExistingWorkOrder = {
  organization_id: string
  assigned_to: string | null
  assigned_staff_id: string | null
  complaint_id: string | null
  status: string
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: profileRaw } = await (supabase as any)
      .from('users')
      .select('organization_id, role, status')
      .eq('id', user.id)
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
      !['owner', 'admin', 'manager', 'call_center', 'technician'].includes(profile.role)
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: workOrderRaw, error: workOrderError } = await (supabase as any)
      .from('work_orders')
      .select('organization_id, assigned_to, assigned_staff_id, complaint_id, status')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single()
    const workOrder = workOrderRaw as ExistingWorkOrder | null
    if (workOrderError || !workOrder) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isTechnician = profile.role === 'technician'
    if (isTechnician) {
      const { data: ownStaffRaw } = await (supabase as any)
        .from('staff')
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', profile.organization_id)
        .eq('employment_status', 'active')
        .maybeSingle()
      const ownStaff = ownStaffRaw as { id: string } | null

      if (!isWorkOrderAssignedToTechnician({
        userId: user.id,
        staffId: ownStaff?.id ?? null,
        workOrder,
      })) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const body = await request.json()
    const allowed = isTechnician ? TECHNICIAN_FIELDS : PRIVILEGED_FIELDS
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key] === '' ? null : body[key]
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Only the assigned technician may move a work order to completed — no
    // other role has this action, even though they can set other statuses.
    if (!isTechnician && updates.status === 'completed') {
      return NextResponse.json(
        { error: 'Only the assigned technician can mark this work order as completed' },
        { status: 403 },
      )
    }

    if (!isTechnician && ('assigned_to' in updates || 'assigned_staff_id' in updates)) {
      const assignedTo = typeof updates.assigned_to === 'string'
        ? updates.assigned_to
        : null
      const assignedStaffId = typeof updates.assigned_staff_id === 'string'
        ? updates.assigned_staff_id
        : null

      if (assignedTo && assignedStaffId) {
        return NextResponse.json(
          { error: 'Choose either a system user or a staff member' },
          { status: 400 },
        )
      }

      if (assignedTo) {
        const { data: assigneeRaw } = await supabase
          .from('users')
          .select('id, full_name')
          .eq('id', assignedTo)
          .eq('organization_id', profile.organization_id)
          .eq('status', 'active')
          .single()
        const assignee = assigneeRaw as { id: string; full_name: string } | null
        if (!assignee) {
          return NextResponse.json({ error: 'Assigned user not found' }, { status: 400 })
        }
        updates.assigned_to = assignee.id
        updates.assigned_staff_id = null
        updates.technician_name = assignee.full_name
      } else if (assignedStaffId) {
        const { data: assigneeRaw } = await supabase
          .from('staff')
          .select('id, full_name')
          .eq('id', assignedStaffId)
          .eq('organization_id', profile.organization_id)
          .eq('employment_status', 'active')
          .single()
        const assignee = assigneeRaw as { id: string; full_name: string } | null
        if (!assignee) {
          return NextResponse.json({ error: 'Assigned staff member not found' }, { status: 400 })
        }
        updates.assigned_to = null
        updates.assigned_staff_id = assignee.id
        updates.technician_name = assignee.full_name
      } else {
        updates.assigned_to = null
        updates.assigned_staff_id = null
        updates.technician_name = null
      }
    }

    if (isTechnician) {
      if (['invoiced', 'paid', 'cancelled', 'completed', 'verified'].includes(workOrder.status)) {
        return NextResponse.json({ error: 'This work order can no longer be updated' }, { status: 409 })
      }
      if ('status' in updates) {
        const nextStatus = updates.status
        const allowedNextStatuses = TECHNICIAN_STATUS_TRANSITIONS[workOrder.status]
        if (
          typeof nextStatus !== 'string' ||
          !allowedNextStatuses?.has(nextStatus)
        ) {
          return NextResponse.json(
            { error: `Cannot move this work order from ${workOrder.status} to ${String(nextStatus)}` },
            { status: 409 },
          )
        }
      }
    }

    const { data: updatedRows, error } = await (supabase as any)
      .from('work_orders')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .select('id')

    if (error) throw error
    if (!updatedRows?.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // If status changed, sync the linked complaint.
    if (updates.status) {
      const complaintStatus = WO_TO_COMPLAINT_STATUS[updates.status as string]
      if (workOrder.complaint_id && complaintStatus) {
        const { error: complaintError } = await (supabase as any)
          .from('complaints')
          .update({ status: complaintStatus, updated_at: new Date().toISOString() })
          .eq('id', workOrder.complaint_id)
          .eq('organization_id', profile.organization_id)
        if (complaintError) {
          console.error('Complaint status sync failed:', complaintError)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Work order PATCH error:', err)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
