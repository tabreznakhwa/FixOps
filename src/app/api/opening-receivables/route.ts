import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function getOrgId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await (supabase as any).from('users').select('organization_id, role').eq('id', user.id).single()
  return data as { organization_id: string; role: string } | null
}

export async function GET() {
  const profile = await getOrgId()
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = createAdminClient() as any
  const { data, error } = await admin
    .from('opening_receivables')
    .select('*, customers(full_name, customer_code)')
    .eq('organization_id', profile.organization_id)
    .order('invoice_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const profile = await getOrgId()
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!['owner', 'admin', 'manager'].includes(profile.role))
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })

  const body = await request.json()
  const { customer_id, invoice_ref, invoice_date, due_date, amount, notes } = body

  if (!customer_id || !invoice_ref || !invoice_date || !amount)
    return NextResponse.json({ error: 'Required fields missing' }, { status: 400 })

  const admin = createAdminClient() as any
  const { data, error } = await admin.from('opening_receivables').insert({
    organization_id: profile.organization_id,
    customer_id,
    invoice_ref: invoice_ref.trim(),
    invoice_date,
    due_date: due_date || null,
    amount: Number(amount),
    balance_due: Number(amount),
    notes: notes?.trim() || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const profile = await getOrgId()
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!['owner', 'admin', 'manager'].includes(profile.role))
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })

  const { id, payment_amount } = await request.json()
  if (!id || !payment_amount || payment_amount <= 0)
    return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 })

  const admin = createAdminClient() as any

  const { data: entry, error: fetchErr } = await admin
    .from('opening_receivables')
    .select('balance_due')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (fetchErr || !entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  if (payment_amount > entry.balance_due)
    return NextResponse.json({ error: `Payment exceeds balance due (${entry.balance_due})` }, { status: 400 })

  const new_balance = Math.max(0, entry.balance_due - payment_amount)

  const { data, error } = await admin
    .from('opening_receivables')
    .update({ balance_due: new_balance })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, balance_due: data.balance_due })
}

export async function DELETE(request: Request) {
  const profile = await getOrgId()
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!['owner', 'admin', 'manager'].includes(profile.role))
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })

  const { id } = await request.json()
  const admin = createAdminClient() as any
  const { error } = await admin.from('opening_receivables').delete()
    .eq('id', id).eq('organization_id', profile.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
