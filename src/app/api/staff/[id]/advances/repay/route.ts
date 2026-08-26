import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: staffId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profileRaw } = await (supabase as any)
    .from('users').select('organization_id, role, full_name').eq('id', user.id).single()
  const profile = profileRaw as { organization_id: string; role: string; full_name: string } | null
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Same role set as issuing an advance/loan — repayment is the mirror action.
  if (!['owner', 'admin', 'hr', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const amount = Number(body.amount)
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 })

  const admin = createAdminClient() as any

  const { data: staff } = await admin
    .from('staff').select('id, organization_id, full_name').eq('id', staffId).single()
  if (!staff || staff.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // The RPC locks the staff row, rejects an amount over the current
  // outstanding balance, decrements it, and inserts the ledger row — all in
  // one transaction, so the check can't be raced past by a concurrent request.
  const { data: resultRaw, error: rpcError } = await admin
    .rpc('record_staff_advance_repayment', {
      p_staff_id: staffId,
      p_org_id: profile.organization_id,
      p_amount: amount,
      p_repayment_date: body.repayment_date || new Date().toISOString().split('T')[0],
      p_payment_method: body.payment_method ?? 'cash',
      p_notes: body.notes || null,
      p_created_by: user.id,
    })
    .single()

  if (rpcError) {
    // Postgres wraps our `raise exception` message in .message — surface it
    // directly since it's already written to be a clear user-facing error.
    return NextResponse.json({ error: rpcError.message }, { status: 400 })
  }

  const result = resultRaw as { id: string; balance_before: number; balance_after: number }

  await logAudit({
    orgId: profile.organization_id,
    userId: user.id,
    userName: profile.full_name,
    action: 'create',
    entityType: 'staff_advance_repayment',
    entityId: result.id,
    entityLabel: `Repayment of ${amount} received from ${staff.full_name}`,
  })

  return NextResponse.json({ success: true, advance_balance: result.balance_after })
}
