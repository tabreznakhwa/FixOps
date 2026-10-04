import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

const WRITE_ROLES = ['owner', 'admin', 'hr', 'manager']
const PAYMENT_MODES = ['cash', 'bank_transfer', 'cheque', 'pos', 'card', 'online', 'knet']

async function getProfile(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('users')
    .select('organization_id, role, full_name')
    .eq('id', user.id)
    .single()
  return data ? { ...data, userId: user.id } : null
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const profile = await getProfile(supabase as any)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const staffId = searchParams.get('staff_id')

  let query = (supabase as any)
    .from('staff_bonuses')
    .select('id, bonus_number, bonus_date, amount, payment_mode, notes, is_voided, void_reason, created_at, staff(full_name)')
    .order('bonus_date', { ascending: false })

  if (staffId) query = query.eq('staff_id', staffId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const profile = await getProfile(supabase as any)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!WRITE_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { staff_id, amount, bonus_date, payment_mode, notes, idempotency_key } = body

  const amt = Number(amount)
  if (!staff_id) return NextResponse.json({ error: 'Employee is required' }, { status: 400 })
  if (!amt || amt <= 0) return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })
  if (!bonus_date) return NextResponse.json({ error: 'Payment date is required' }, { status: 400 })
  if (payment_mode && !PAYMENT_MODES.includes(payment_mode)) {
    return NextResponse.json({ error: 'Invalid payment mode' }, { status: 400 })
  }

  // The staff must belong to this organization — RLS scopes this read, so a
  // staff_id from another org returns no row.
  const { data: staff } = await (supabase as any)
    .from('staff')
    .select('id, full_name')
    .eq('id', staff_id)
    .single()
  if (!staff) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const mode = payment_mode ?? 'cash'

  // Idempotency: a retried form submission reuses its key, so replaying the
  // POST returns the row already created instead of a duplicate payment.
  if (idempotency_key) {
    const { data: existing } = await (supabase as any)
      .from('staff_bonuses')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .eq('idempotency_key', idempotency_key)
      .maybeSingle()
    if (existing) return NextResponse.json(existing)
  }

  const { data: seqData } = await (supabase as any).rpc('generate_sequence_number', {
    p_org_id: profile.organization_id,
    p_type: 'staff_bonus',
    p_prefix: 'BON',
  })
  const bonusNumber = seqData ?? `BON-${Date.now()}`

  const { data, error } = await (supabase as any)
    .from('staff_bonuses')
    .insert({
      organization_id: profile.organization_id,
      staff_id,
      bonus_number: bonusNumber,
      bonus_date,
      amount: amt,
      payment_mode: mode,
      notes: notes?.trim() ? notes.trim() : null,
      idempotency_key: idempotency_key ?? null,
      created_by: profile.userId,
    })
    .select('*')
    .single()

  // The unique(organization_id, idempotency_key) / (organization_id, bonus_number)
  // indexes are the backstop against a concurrent double-submit that slipped past
  // the pre-check above.
  if (error) {
    if (error.code === '23505' && idempotency_key) {
      const { data: existing } = await (supabase as any)
        .from('staff_bonuses')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .eq('idempotency_key', idempotency_key)
        .maybeSingle()
      if (existing) return NextResponse.json(existing)
    }
    return NextResponse.json({ error: error.message }, { status: 409 })
  }

  await logAudit({
    orgId: profile.organization_id,
    userId: profile.userId,
    userName: profile.full_name,
    action: 'create',
    entityType: 'staff_bonus',
    entityId: data.id,
    entityLabel: `Bonus of ${amt} to ${staff.full_name}`,
  })

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const profile = await getProfile(supabase as any)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!WRITE_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: existing } = await (supabase as any)
    .from('staff_bonuses')
    .select('*')
    .eq('id', id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Bonus not found' }, { status: 404 })

  // Void: soft-delete that keeps the original record for the audit trail.
  if (body.void === true) {
    const voidReason = body.void_reason?.trim() ? body.void_reason.trim() : null
    const { data, error } = await (supabase as any)
      .from('staff_bonuses')
      .update({
        is_voided: true,
        void_reason: voidReason,
        voided_by: profile.userId,
        voided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAudit({
      orgId: profile.organization_id,
      userId: profile.userId,
      userName: profile.full_name,
      action: 'delete',
      entityType: 'staff_bonus',
      entityId: id,
      entityLabel: `Voided bonus ${existing.bonus_number}`,
      changes: { void_reason: { before: existing.void_reason ?? null, after: voidReason } },
    })

    return NextResponse.json(data)
  }

  // In-place edit: fix an amount/date/mode/notes typo without losing the row.
  const amt = Number(body.amount)
  if (body.amount !== undefined && (!amt || amt <= 0)) {
    return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })
  }
  if (body.payment_mode && !PAYMENT_MODES.includes(body.payment_mode)) {
    return NextResponse.json({ error: 'Invalid payment mode' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const changes: Record<string, { before: unknown; after: unknown }> = {}

  const fields: Array<{ key: string; before: unknown; after: unknown }> = [
    { key: 'amount', before: Number(existing.amount), after: body.amount !== undefined ? amt : Number(existing.amount) },
    { key: 'bonus_date', before: existing.bonus_date, after: body.bonus_date ?? existing.bonus_date },
    { key: 'payment_mode', before: existing.payment_mode, after: body.payment_mode ?? existing.payment_mode },
    { key: 'notes', before: existing.notes ?? null, after: body.notes?.trim() ? body.notes.trim() : null },
  ]
  for (const f of fields) {
    if (String(f.before) !== String(f.after)) {
      updates[f.key] = f.after
      changes[f.key] = { before: f.before, after: f.after }
    }
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json(existing)
  }

  const { data, error } = await (supabase as any)
    .from('staff_bonuses')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit({
    orgId: profile.organization_id,
    userId: profile.userId,
    userName: profile.full_name,
    action: 'update',
    entityType: 'staff_bonus',
    entityId: id,
    entityLabel: `Bonus ${existing.bonus_number}`,
    changes,
  })

  return NextResponse.json(data)
}
