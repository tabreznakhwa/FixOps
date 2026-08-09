import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function getProfile(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('organization_id, role').eq('id', user.id).single()
  return data ? { ...data, userId: user.id } : null
}

export async function GET() {
  const supabase = await createClient()
  const profile = await getProfile(supabase as any)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await (supabase as any)
    .from('owner_withdrawals')
    .select('id, withdrawal_date, amount, payment_mode, purpose, notes, created_at')
    .order('withdrawal_date', { ascending: false })
    .limit(1000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const profile = await getProfile(supabase as any)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { withdrawal_date, amount, payment_mode, purpose, notes } = body
  if (!withdrawal_date || !amount || !payment_mode) {
    return NextResponse.json({ error: 'withdrawal_date, amount, and payment_mode are required' }, { status: 400 })
  }

  const { data, error } = await (supabase as any)
    .from('owner_withdrawals')
    .insert({
      organization_id: profile.organization_id,
      withdrawal_date,
      amount: Number(amount),
      payment_mode,
      purpose: purpose || null,
      notes: notes || null,
      created_by: profile.userId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const profile = await getProfile(supabase as any)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, withdrawal_date, amount, payment_mode, purpose, notes } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!withdrawal_date || !payment_mode) {
    return NextResponse.json({ error: 'withdrawal_date and payment_mode are required' }, { status: 400 })
  }
  const amt = Number(amount)
  if (!amt || amt <= 0) {
    return NextResponse.json({ error: 'Enter a valid amount' }, { status: 400 })
  }

  const { data, error } = await (supabase as any)
    .from('owner_withdrawals')
    .update({
      withdrawal_date,
      amount: amt,
      payment_mode,
      purpose: purpose || null,
      notes: notes || null,
    })
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const profile = await getProfile(supabase as any)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await (supabase as any).from('owner_withdrawals').delete().eq('id', id).eq('organization_id', profile.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
