import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: staffId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profileRaw } = await (supabase as any)
    .from('users').select('organization_id, role').eq('id', user.id).single()
  const profile = profileRaw as { organization_id: string; role: string } | null
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient() as any

  const { data: staff } = await admin
    .from('staff').select('organization_id').eq('id', staffId).single()
  if (!staff || staff.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data, error } = await admin
    .from('staff_advances')
    .select('*')
    .eq('staff_id', staffId)
    .order('issued_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: staffId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profileRaw } = await (supabase as any)
    .from('users').select('organization_id, role').eq('id', user.id).single()
  const profile = profileRaw as { organization_id: string; role: string } | null
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!['owner', 'admin', 'hr', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const amount = Number(body.amount)
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 })

  const admin = createAdminClient() as any

  const { data: staff } = await admin
    .from('staff').select('organization_id, advance_balance').eq('id', staffId).single()
  if (!staff || staff.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error: insertError } = await admin.from('staff_advances').insert({
    organization_id: profile.organization_id,
    staff_id: staffId,
    type: body.type ?? 'advance',
    amount,
    issued_date: body.issued_date || new Date().toISOString().split('T')[0],
    notes: body.notes || null,
    created_by: user.id,
  })
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  const newBalance = (staff.advance_balance ?? 0) + amount
  const { error: updateError } = await admin
    .from('staff').update({ advance_balance: newBalance }).eq('id', staffId)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true, advance_balance: newBalance })
}
