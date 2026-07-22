import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface NoteRow {
  id: string
  note: string
  author_name: string
  created_at: string
}

interface NotesTable {
  insert(values: {
    organization_id: string
    complaint_id: string
    note: string
    author_name: string
    created_by: string
  }): {
    select(columns: string): {
      single(): Promise<{ data: NoteRow | null; error: Error | null }>
    }
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: complaintId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await supabase
      .from('users').select('organization_id, full_name, role').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; full_name: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const note = body.note?.trim()
    if (!note) return NextResponse.json({ error: 'Note is required' }, { status: 400 })

    const notesTable = supabase.from('complaint_internal_notes') as unknown as NotesTable
    const { data, error } = await notesTable
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
