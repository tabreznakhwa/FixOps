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
  const { data, error } = await (supabase as any)
    .from('fund_transfers')
    .select('id, transfer_date, from_account, to_account, amount, reference_number, notes, created_at')
    .order('transfer_date', { ascending: false })
    .limit(1000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const profile = await getProfile(supabase as any)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { transfer_date, from_account, to_account, amount, reference_number, notes } = body
  if (!transfer_date || !from_account || !to_account || !amount) {
    return NextResponse.json({ error: 'transfer_date, from_account, to_account, and amount are required' }, { status: 400 })
  }
  if (from_account === to_account) {
    return NextResponse.json({ error: 'From and To accounts must be different' }, { status: 400 })
  }

  const { data, error } = await (supabase as any)
    .from('fund_transfers')
    .insert({
      organization_id: profile.organization_id,
      transfer_date,
      from_account,
      to_account,
      amount: Number(amount),
      reference_number: reference_number || null,
      notes: notes || null,
      created_by: profile.userId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const profile = await getProfile(supabase as any)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await (supabase as any).from('fund_transfers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
