import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await (supabase as any)
      .from('complaints')
      .select('id, complaint_number, service_category, priority, description, location, preferred_date, preferred_time, status')
      .eq('id', id)
      .single()

    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Complaint not found' }, { status: 404 })
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
      const { service_category, priority, description, location, preferred_date, preferred_time } = body
      if (!description?.trim()) return NextResponse.json({ error: 'Description is required' }, { status: 400 })
      const supabase = createAdminClient()
      const { error } = await (supabase as any).from('complaints').update({
        service_category: Array.isArray(service_category) ? service_category : [service_category],
        priority: priority ?? 'medium',
        description: description.trim(),
        location: location?.trim() || null,
        preferred_date: preferred_date || null,
        preferred_time: preferred_time || null,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    const allowed = ['status', 'assigned_to', 'assigned_staff_id', 'technician_name', 'priority', 'notes', 'visit_order']
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) {
        if (key === 'visit_order') {
          updates[key] = body[key] != null ? parseInt(body[key]) || null : null
        } else {
          updates[key] = body[key] || null
        }
      }
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

    // Send WhatsApp notification when a complaint is assigned to a technician
    if (updates.assigned_to) {
      try {
        const [{ data: techRaw }, { data: complaintRaw }] = await Promise.all([
          (supabase as any).from('users').select('full_name, mobile_number').eq('id', updates.assigned_to).single(),
          (supabase as any).from('complaints').select('complaint_number, description, location').eq('id', id).single(),
        ])
        const tech = techRaw as { full_name: string; mobile_number: string | null } | null
        const complaint = complaintRaw as { complaint_number: string; description: string; location: string | null } | null
        if (tech?.mobile_number && complaint) {
          const description = (complaint.description ?? '').slice(0, 100)
          const location = complaint.location ? ` · ${complaint.location}` : ''
          await sendWhatsAppMessage(tech.mobile_number, [
            complaint.complaint_number,
            `${description}${location}`,
          ])
        }
      } catch (waErr) {
        console.error('WhatsApp notification failed:', waErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Complaint PATCH error:', err)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
