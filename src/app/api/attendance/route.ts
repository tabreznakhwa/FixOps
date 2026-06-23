import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const {
      staff_id,
      date,
      check_in,
      check_out,
      hours_worked,
      overtime_hours,
      status,
      notes,
    } = body

    if (!staff_id) return NextResponse.json({ error: 'Staff member is required' }, { status: 400 })
    if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    if (!status) return NextResponse.json({ error: 'Status is required' }, { status: 400 })

    const supabase = createAdminClient()

    const { data: record, error } = await (supabase as any)
      .from('attendance')
      .insert({
        organization_id: profile.organization_id,
        staff_id,
        date,
        check_in: check_in || null,
        check_out: check_out || null,
        hours_worked: Number(hours_worked ?? 0),
        overtime_hours: Number(overtime_hours ?? 0),
        status,
        notes: notes?.trim() || null,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (error) throw error

    return NextResponse.json({ id: record.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Create attendance error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
