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

  const admin = createAdminClient() as any
  const { error } = await admin.from('expenses').update({
    expense_date,
    category,
    description: description.trim(),
    amount: Number(amount),
    payment_method,
    reference_number: reference_number?.trim() || null,
    notes: notes?.trim() || null,
  }).eq('id', id).eq('organization_id', profile.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
  const { error } = await admin.from('expenses').delete()
    .eq('id', id).eq('organization_id', profile.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
