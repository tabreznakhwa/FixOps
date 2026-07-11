import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await (supabase as any)
    .from('amc_payments')
    .select('id, payment_date, amount, payment_mode, reference_number, notes, created_at')
    .eq('amc_contract_id', id)
    .order('payment_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profileRaw } = await (supabase as any)
    .from('users').select('organization_id, role').eq('id', user.id).single()
  const profile = profileRaw as { organization_id: string; role: string } | null
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify contract belongs to org
  const { data: contract } = await (supabase as any)
    .from('amc_contracts').select('id').eq('id', id).eq('organization_id', profile.organization_id).single()
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { payment_date, amount, payment_mode, reference_number, notes, is_pre_opening } = body
  if (!payment_date || !amount || !payment_mode) {
    return NextResponse.json({ error: 'payment_date, amount, and payment_mode are required' }, { status: 400 })
  }

  const { data, error } = await (supabase as any)
    .from('amc_payments')
    .insert({
      organization_id: profile.organization_id,
      amc_contract_id: id,
      payment_date,
      amount: Number(amount),
      payment_mode,
      reference_number: reference_number || null,
      notes: notes || null,
      is_pre_opening: is_pre_opening === true,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { payment_id } = body
  if (!payment_id) return NextResponse.json({ error: 'payment_id required' }, { status: 400 })

  const { error } = await (supabase as any)
    .from('amc_payments').delete().eq('id', payment_id).eq('amc_contract_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
