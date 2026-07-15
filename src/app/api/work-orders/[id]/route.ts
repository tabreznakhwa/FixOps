import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

// When WO status advances, sync the linked complaint to the same stage
const WO_TO_COMPLAINT_STATUS: Record<string, string> = {
  assigned: 'assigned',
  work_started: 'work_started',
  waiting_parts: 'waiting_parts',
  completed: 'completed',
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users').select('organization_id, role').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile || !['owner', 'admin', 'manager', 'technician'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const allowed = ['status', 'assigned_to', 'assigned_staff_id', 'technician_name', 'priority', 'notes', 'final_amount', 'payment_status', 'scheduled_date', 'scheduled_time', 'service_category']
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key] || null
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Verify the work order belongs to this org
    const { data: wo0 } = await (supabase as any)
      .from('work_orders').select('organization_id').eq('id', id).single()
    if (!wo0 || wo0.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { error } = await (supabase as any)
      .from('work_orders')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error

    // If status changed, sync the linked complaint
    if (updates.status) {
      const { data: wo } = await (supabase as any)
        .from('work_orders')
        .select('complaint_id')
        .eq('id', id)
        .single()

      const complaintStatus = WO_TO_COMPLAINT_STATUS[updates.status as string]
      if (wo?.complaint_id && complaintStatus) {
        await (supabase as any)
          .from('complaints')
          .update({ status: complaintStatus, updated_at: new Date().toISOString() })
          .eq('id', wo.complaint_id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Work order PATCH error:', err)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
