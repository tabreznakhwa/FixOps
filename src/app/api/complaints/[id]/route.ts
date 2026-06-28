import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient() as any
    const { data, error } = await supabase
      .from('complaints')
      .select('id, complaint_number, service_category, priority, description, location, preferred_date, preferred_time, notes, status')
      .eq('id', id)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })
    return NextResponse.json({ complaint: data })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

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

    // Full edit (description, category, etc.)
    if (body.edit === true) {
      const { service_category, priority, description, location, preferred_date, preferred_time, notes } = body
      if (!description?.trim()) return NextResponse.json({ error: 'Description is required' }, { status: 400 })
      const supabase = createAdminClient()
      const { error } = await (supabase as any).from('complaints').update({
        service_category: Array.isArray(service_category) ? service_category : [service_category],
        priority: priority ?? 'medium',
        description: description.trim(),
        location: location?.trim() || null,
        preferred_date: preferred_date || null,
        preferred_time: preferred_time || null,
        notes: notes?.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

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
