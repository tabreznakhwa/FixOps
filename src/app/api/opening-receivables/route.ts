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
    .is('reversal_posting_id', null)
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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = createAdminClient() as any
  const { data: rpcResult, error } = await admin.rpc('record_opening_receivable', {
    p_org_id: profile.organization_id,
    p_actor_id: user.id,
    p_customer_id: customer_id,
    p_invoice_ref: invoice_ref.trim(),
    p_invoice_date: invoice_date,
    p_due_date: due_date || null,
    p_amount: Number(amount),
    p_notes: notes?.trim() || null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = Array.isArray(rpcResult) ? rpcResult : rpcResult ? [rpcResult] : []
  const createdId = (rows[0] as { opening_receivable_id?: string } | undefined)?.opening_receivable_id
  if (!createdId) return NextResponse.json({ error: 'Opening receivable was not created' }, { status: 500 })

  const { data: created, error: fetchError } = await admin
    .from('opening_receivables')
    .select('*, customers(full_name, customer_code)')
    .eq('id', createdId)
    .eq('organization_id', profile.organization_id)
    .single()
  if (fetchError || !created) {
    return NextResponse.json({ error: fetchError?.message ?? 'Created opening receivable could not be loaded' }, { status: 500 })
  }
  return NextResponse.json(created)
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

  const pDate = payment_date
  if (!pDate) return NextResponse.json({ error: 'Payment date is required' }, { status: 400 })

  const admin = createAdminClient() as any
  const { data: rpcResult, error } = await admin.rpc('collect_opening_receivable', {
    p_org_id: profile.organization_id,
    p_actor_id: user.id,
    p_opening_receivable_id: id,
    p_customer_id: customer_id,
    p_payment_date: pDate,
    p_amount_received: Number(payment_amount),
    p_payment_mode: payment_mode,
    p_reference_number: invoice_ref ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = Array.isArray(rpcResult) ? rpcResult : rpcResult ? [rpcResult] : []
  const row = rows[0] as { balance_due?: number } | undefined
  return NextResponse.json({ success: true, balance_due: row?.balance_due })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getOrgId()
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!['owner', 'admin', 'manager'].includes(profile.role))
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })

  const { id, reason } = await request.json()
  if (!id) return NextResponse.json({ error: 'Entry is required' }, { status: 400 })
  if (!reason?.trim()) return NextResponse.json({ error: 'Reversal reason is required' }, { status: 400 })

  const admin = createAdminClient() as any
  const { error } = await admin.rpc('reverse_opening_receivable', {
    p_org_id: profile.organization_id,
    p_actor_id: user.id,
    p_opening_receivable_id: id,
    p_reason: reason.trim(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
