import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import {
  authorizeWorkOrderMutation,
  hasNonCancelledWorkOrderInvoice,
  isAuthorizationResponse,
} from '@/lib/workOrderMutationAccess'
import { isWorkOrderServiceCategory } from '@/lib/workOrderCategories'

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
const TECHNICIAN_FIELDS = new Set(['status', 'notes', 'service_category', 'job_description'])
const TECHNICIAN_DETAIL_FIELDS = ['notes', 'service_category', 'job_description'] as const
const TECHNICIAN_STATUS_TRANSITIONS: Record<string, Set<string>> = {
  new: new Set(['accepted', 'completed']),
  assigned: new Set(['accepted', 'completed']),
  accepted: new Set(['on_the_way', 'completed']),
  on_the_way: new Set(['work_started', 'completed']),
  work_started: new Set(['waiting_parts', 'waiting_approval', 'completed']),
  waiting_parts: new Set(['work_started', 'waiting_approval', 'completed']),
  waiting_approval: new Set(['work_started', 'completed']),
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const authorization = await authorizeWorkOrderMutation(supabase, user.id, id)
    if (isAuthorizationResponse(authorization)) return authorization
    const workOrder = authorization
    const isTechnician = workOrder.actorRole === 'technician'

    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const allowed = isTechnician ? TECHNICIAN_FIELDS : PRIVILEGED_FIELDS
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key] === '' ? null : body[key]
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    if (isTechnician) {
      if (['invoiced', 'paid', 'cancelled'].includes(workOrder.status)) {
        return NextResponse.json({ error: 'This work order can no longer be updated' }, { status: 409 })
      }

      const updatesJobDetails = TECHNICIAN_DETAIL_FIELDS.some(field => field in updates)
      if (updatesJobDetails && await hasNonCancelledWorkOrderInvoice(
        supabase,
        workOrder.organization_id,
        id,
      )) {
        return NextResponse.json(
          { error: 'An invoice has already been generated for this work order' },
          { status: 409 },
        )
      }

      if ('service_category' in updates) {
        const category = updates.service_category
        if (category !== null && !isWorkOrderServiceCategory(category)) {
          return NextResponse.json({ error: 'Invalid service category' }, { status: 400 })
        }
      }

      if ('job_description' in updates) {
        const description = updates.job_description
        if (typeof description !== 'string' || !description.trim()) {
          return NextResponse.json({ error: 'Job description is required' }, { status: 400 })
        }
        updates.job_description = description.trim()
      }

      if ('notes' in updates) {
        const notes = updates.notes
        if (notes !== null && typeof notes !== 'string') {
          return NextResponse.json({ error: 'Invalid notes' }, { status: 400 })
        }
        updates.notes = typeof notes === 'string' ? (notes.trim() || null) : null
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
          .eq('organization_id', workOrder.organization_id)
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
          .eq('organization_id', workOrder.organization_id)
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

    const { data: updatedRows, error } = await (supabase as any)
      .from('work_orders')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', workOrder.organization_id)
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
          .eq('organization_id', workOrder.organization_id)
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
