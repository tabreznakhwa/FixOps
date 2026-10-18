import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(request: NextRequest) {
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: profile } = await (supabase as any)
      .from('users')
      .select('organization_id, role, full_name, status')
      .eq('id', user.id)
      .single()

    if (!profile || profile.status !== 'active' || !profile.organization_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!['owner', 'admin', 'manager', 'call_center', 'technician'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const {
      customer_id,
      complaint_id,
      assigned_to,
      assigned_staff_id,
      service_category,
      priority,
      job_description,
      scheduled_date,
      scheduled_time,
      estimated_hours,
      estimated_amount,
      notes,
    } = body

    if (!customer_id || !job_description?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const parsedEstimatedAmount = estimated_amount === null || estimated_amount === undefined || estimated_amount === ''
      ? null
      : Number(estimated_amount)
    const parsedEstimatedHours = estimated_hours === null || estimated_hours === undefined || estimated_hours === ''
      ? null
      : Number(estimated_hours)
    if (
      (parsedEstimatedAmount !== null && (!Number.isFinite(parsedEstimatedAmount) || parsedEstimatedAmount < 0)) ||
      (parsedEstimatedHours !== null && (!Number.isFinite(parsedEstimatedHours) || parsedEstimatedHours < 0))
    ) {
      return NextResponse.json({ error: 'Invalid estimate' }, { status: 400 })
    }

    const { data: customer } = await (supabase as any)
      .from('customers')
      .select('id')
      .eq('id', customer_id)
      .eq('organization_id', profile.organization_id)
      .single()
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 400 })
    }

    if (complaint_id) {
      const { data: complaint } = await (supabase as any)
        .from('complaints')
        .select('id, customer_id')
        .eq('id', complaint_id)
        .eq('organization_id', profile.organization_id)
        .single()
      if (!complaint || complaint.customer_id !== customer_id) {
        return NextResponse.json({ error: 'Complaint does not match this customer' }, { status: 400 })
      }
    }

    const isTechnician = profile.role === 'technician'
    const parsedEstimatedAmountForInsert = isTechnician ? null : parsedEstimatedAmount
    let resolvedAssignedTo = isTechnician ? user.id : (assigned_to ?? null)
    let resolvedAssignedStaffId = isTechnician ? null : (assigned_staff_id ?? null)
    let resolvedTechnicianName = isTechnician ? profile.full_name : null

    if (!isTechnician && resolvedAssignedTo) {
      const { data: assignee } = await (supabase as any)
        .from('users')
        .select('id, full_name')
        .eq('id', resolvedAssignedTo)
        .eq('organization_id', profile.organization_id)
        .eq('status', 'active')
        .single()
      if (!assignee) {
        return NextResponse.json({ error: 'Assigned user not found' }, { status: 400 })
      }
      resolvedTechnicianName = assignee.full_name
      resolvedAssignedStaffId = null
    } else if (!isTechnician && resolvedAssignedStaffId) {
      const { data: assignee } = await (supabase as any)
        .from('staff')
        .select('id, full_name')
        .eq('id', resolvedAssignedStaffId)
        .eq('organization_id', profile.organization_id)
        .eq('employment_status', 'active')
        .single()
      if (!assignee) {
        return NextResponse.json({ error: 'Assigned staff member not found' }, { status: 400 })
      }
      resolvedTechnicianName = assignee.full_name
      resolvedAssignedTo = null
    }

    const { data: seqData } = await (supabase as any).rpc('generate_sequence_number', {
      p_org_id: profile.organization_id,
      p_type: 'work_order',
      p_prefix: 'WO',
    })
    const workOrderNumber = seqData ?? `WO-${Date.now()}`

    const { data: wo, error } = await (supabase as any)
      .from('work_orders')
      .insert({
        organization_id: profile.organization_id,
        work_order_number: workOrderNumber,
        customer_id,
        complaint_id: complaint_id ?? null,
        assigned_to: resolvedAssignedTo,
        assigned_staff_id: resolvedAssignedStaffId,
        technician_name: resolvedTechnicianName,
        created_by: user.id,
        service_category: service_category ?? null,
        priority,
        status: (resolvedAssignedTo || resolvedAssignedStaffId) ? 'assigned' : 'new',
        job_description: job_description.trim(),
        scheduled_date: scheduled_date ?? null,
        scheduled_time: scheduled_time ?? null,
        estimated_hours: parsedEstimatedHours,
        estimated_amount: parsedEstimatedAmountForInsert,
        final_amount: parsedEstimatedAmountForInsert ?? 0,
        notes: notes?.trim() || null,
        payment_status: 'unpaid',
      })
      .select('id, work_order_number')
      .single()

    if (error) throw error

    await logAudit({
      orgId: profile.organization_id,
      userId: user.id,
      userName: profile.full_name,
      action: 'create',
      entityType: 'work_order',
      entityId: wo.id,
      entityLabel: wo.work_order_number,
    })

    return NextResponse.json({ success: true, id: wo.id, workOrderNumber: wo.work_order_number })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Create work order error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
