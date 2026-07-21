import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: complaintId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabase as any)
      .from('users').select('organization_id, full_name, role').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; full_name: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const note = body.note?.trim()
    if (!note) return NextResponse.json({ error: 'Note is required' }, { status: 400 })

    const admin = createAdminClient() as any
    const { data, error } = await admin
      .from('complaint_internal_notes')
      .insert({
        organization_id: profile.organization_id,
        complaint_id: complaintId,
        note,
        author_name: profile.full_name,
        created_by: user.id,
      })
      .select('id, note, author_name, created_at')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to add note' }, { status: 500 })
  }
}
