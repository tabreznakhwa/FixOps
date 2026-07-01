import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users').select('organization_id, role').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const allowed = ['owner', 'admin', 'manager']
    if (!allowed.includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { date, check_in, check_out, hours_worked, overtime_hours, status, notes } = body

    if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    if (!status) return NextResponse.json({ error: 'Status is required' }, { status: 400 })

    const admin = createAdminClient() as any
    const { error } = await admin
      .from('attendance')
      .update({
        date,
        check_in: check_in || null,
        check_out: check_out || null,
        hours_worked: Number(hours_worked ?? 0),
        overtime_hours: Number(overtime_hours ?? 0),
        status,
        notes: notes?.trim() || null,
      })
      .eq('id', id)
      .eq('organization_id', profile.organization_id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
