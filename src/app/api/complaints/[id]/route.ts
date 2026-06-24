import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users').select('organization_id').eq('id', user.id).single()
    const orgId = (profileRaw as { organization_id: string } | null)?.organization_id

    const body = await request.json()
    const allowed = ['status', 'assigned_to', 'assigned_staff_id', 'technician_name', 'priority', 'notes']
    const updates: Record<string, string | null> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key] || null
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const complaintUpdate: Record<string, unknown> = { ...updates, updated_at: now }
    // Stamp closed_at once when status reaches completed
    if (updates.status === 'completed') complaintUpdate.closed_at = now

    const supabase = createAdminClient()
    const { error } = await (supabase as any)
      .from('complaints')
      .update(complaintUpdate)
      .eq('id', id)

    if (error) throw error

    // Also log to status history (best-effort, non-blocking)
    if (updates.status && orgId) {
      await (supabase as any)
        .from('complaint_status_history')
        .insert({ organization_id: orgId, complaint_id: id, new_status: updates.status, updated_by: user.id })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Complaint PATCH error:', err)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
