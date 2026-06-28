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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getOrgId()
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!['owner', 'admin', 'manager'].includes(profile.role))
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })

  const { id, payment_amount, payment_mode, payment_date, customer_id, invoice_ref } = await request.json()
  if (!id || !payment_amount || payment_amount <= 0)
    return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 })
  if (!payment_mode) return NextResponse.json({ error: 'Payment mode is required' }, { status: 400 })
  if (!customer_id) return NextResponse.json({ error: 'Customer is required' }, { status: 400 })

  const admin = createAdminClient() as any
  const pDate = payment_date || new Date().toISOString().split('T')[0]

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

  // 1. Reduce balance_due
  const { error: updateErr } = await admin
    .from('opening_receivables')
    .update({ balance_due: new_balance })
    .eq('id', id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // 2. Generate payment number
  const { data: seqData } = await admin.rpc('generate_sequence_number', {
    p_org_id: profile.organization_id,
    p_type: 'payment',
    p_prefix: 'PMT',
  })
  const paymentNumber = seqData ?? `PMT-${Date.now()}`

  // 3. Insert into payments (feeds Cash Book / Bank Book)
  const { data: payment, error: payErr } = await admin
    .from('payments')
    .insert({
      organization_id: profile.organization_id,
      payment_number: paymentNumber,
      customer_id,
      invoice_id: null,
      payment_date: pDate,
      amount_received: payment_amount,
      payment_mode,
      reference_number: invoice_ref ?? null,
      notes: `Opening receivable payment — ${invoice_ref ?? ''}`.trim(),
      is_advance: false,
      advance_used_amount: 0,
      is_cancelled: false,
      received_by: user.id,
    })
    .select('id, payment_number')
    .single()

  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })

  // 4. Customer ledger entry
  await admin.from('customer_ledger_entries').insert({
    organization_id: profile.organization_id,
    customer_id,
    entry_date: pDate,
    entry_type: 'payment',
    debit_amount: 0,
    credit_amount: payment_amount,
    description: `Opening receivable payment — ${invoice_ref ?? ''}`.trim(),
    reference_type: 'payment',
    reference_id: payment.id,
    created_by: user.id,
  })

  return NextResponse.json({ success: true, balance_due: new_balance })
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
