import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export async function POST(request: NextRequest) {
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await (supabaseUser as any)
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const {
      customer_id,
      complaint_id,
      assigned_to,
      assigned_staff_id,
      technician_name,
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

    const supabase = createAdminClient()

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
        assigned_to: assigned_to ?? null,
        assigned_staff_id: assigned_staff_id ?? null,
        technician_name: technician_name ?? null,
        created_by: user.id,
        service_category: service_category ?? null,
        priority,
        status: (assigned_to || assigned_staff_id) ? 'assigned' : 'new',
        job_description: job_description.trim(),
        scheduled_date: scheduled_date ?? null,
        scheduled_time: scheduled_time ?? null,
        estimated_hours: estimated_hours ?? null,
        estimated_amount: estimated_amount ?? null,
        final_amount: estimated_amount ?? 0,
        notes: notes?.trim() || null,
        payment_status: 'unpaid',
      })
      .select('id, work_order_number')
      .single()

    if (error) throw error

    await logAudit({
      orgId: profile.organization_id,
      userId: user.id,
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
