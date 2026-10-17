/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function context() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await (supabase as any).from('users')
    .select('organization_id, role').eq('id', user.id).single()
  return data ? { user, profile: data as { organization_id: string; role: string } } : null
}

export async function GET() {
  const auth = await context()
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = createAdminClient() as any
  const { data, error } = await admin.from('opening_payables')
    .select('*, suppliers(supplier_name, supplier_code)')
    .eq('organization_id', auth.profile.organization_id)
    .is('reversal_posting_id', null)
    .order('bill_date', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const auth = await context()
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!['owner', 'admin', 'manager'].includes(auth.profile.role)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  const { supplier_id, bill_ref, bill_date, due_date, amount, notes } = await request.json()
  if (!supplier_id || !bill_ref || !bill_date || !amount) return NextResponse.json({ error: 'Required fields missing' }, { status: 400 })
  const admin = createAdminClient() as any
  const { data: result, error } = await admin.rpc('record_opening_payable', {
    p_org_id: auth.profile.organization_id, p_actor_id: auth.user.id,
    p_supplier_id: supplier_id, p_bill_ref: bill_ref.trim(), p_bill_date: bill_date,
    p_due_date: due_date || null, p_amount: Number(amount), p_notes: notes?.trim() || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = Array.isArray(result) ? result : result ? [result] : []
  const id = rows[0]?.opening_payable_id
  const { data, error: fetchError } = await admin.from('opening_payables')
    .select('*, suppliers(supplier_name, supplier_code)').eq('id', id)
    .eq('organization_id', auth.profile.organization_id).single()
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const auth = await context()
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!['owner', 'admin', 'manager'].includes(auth.profile.role)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  const { id, payment_amount, payment_mode, payment_date, supplier_id, bill_ref } = await request.json()
  if (!id || !payment_amount || payment_amount <= 0 || !payment_mode || !payment_date || !supplier_id) return NextResponse.json({ error: 'Valid payment details are required' }, { status: 400 })
  const admin = createAdminClient() as any
  const { data: result, error } = await admin.rpc('collect_opening_payable', {
    p_org_id: auth.profile.organization_id, p_actor_id: auth.user.id,
    p_opening_payable_id: id, p_supplier_id: supplier_id, p_payment_date: payment_date,
    p_amount_paid: Number(payment_amount), p_payment_mode: payment_mode,
    p_reference_number: bill_ref ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = Array.isArray(result) ? result : result ? [result] : []
  return NextResponse.json({ success: true, balance_due: rows[0]?.balance_due })
}

export async function DELETE(request: Request) {
  const auth = await context()
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!['owner', 'admin', 'manager'].includes(auth.profile.role)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  const { id, reason } = await request.json()
  if (!id || !reason?.trim()) return NextResponse.json({ error: 'Entry and reversal reason are required' }, { status: 400 })
  const admin = createAdminClient() as any
  const { error } = await admin.rpc('reverse_opening_payable', {
    p_org_id: auth.profile.organization_id, p_actor_id: auth.user.id,
    p_opening_payable_id: id, p_reason: reason.trim(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
