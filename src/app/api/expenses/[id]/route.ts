import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function getProfile(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profileRaw } = await (supabase as any)
    .from('users').select('organization_id, role').eq('id', user.id).single()
  return profileRaw as { organization_id: string; role: string } | null
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile(request)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin', 'hr', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { expense_date, category, description, amount, payment_method, reference_number, notes } = body
  if (!expense_date || !category || !description || !amount || !payment_method) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (category === 'asset_purchase') {
    return NextResponse.json({ error: 'Record capital purchases in the Company Assets register' }, { status: 400 })
  }
  if (Number(amount) <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })
  }

  const admin = createAdminClient() as any
  const { data: existing } = await admin.from('expenses')
    .select('asset_id')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  if (existing.asset_id) {
    return NextResponse.json({ error: 'Asset purchase expenses can only be changed from the Company Assets register' }, { status: 409 })
  }

  const { data: updated, error } = await admin.from('expenses').update({
    expense_date,
    category,
    description: description.trim(),
    amount: Number(amount),
    payment_method,
    reference_number: reference_number?.trim() || null,
    notes: notes?.trim() || null,
  }).eq('id', id).eq('organization_id', profile.organization_id).is('asset_id', null).select('id').maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile(_request)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin', 'hr', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient() as any
  const { data: existing } = await admin.from('expenses')
    .select('asset_id')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  if (existing.asset_id) {
    return NextResponse.json({ error: 'Asset purchase expenses cannot be deleted; dispose of the asset from the Company Assets register' }, { status: 409 })
  }

  const { data: deleted, error } = await admin.from('expenses').delete()
    .eq('id', id).eq('organization_id', profile.organization_id).is('asset_id', null).select('id').maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
