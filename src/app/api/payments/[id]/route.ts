import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users').select('organization_id, role').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient() as any
    const { data, error } = await supabase
      .from('payments')
      .select('id, payment_number, payment_date, amount_received, payment_mode, reference_number, notes, is_advance, is_cancelled, cancelled_reason, customers(id, full_name, mobile_number), invoices(id, invoice_number, total_amount)')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    return NextResponse.json({ payment: data })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users').select('organization_id, role, full_name').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; role: string; full_name: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: Record<string, unknown>
    try {
      const parsed: unknown = await request.json()
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
      }
      body = parsed as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 })
    }
    const supabase = createAdminClient() as any

    // Fetch current payment — scoped to org
    const { data: payment } = await supabase
      .from('payments')
      .select('id, payment_number, invoice_id, is_advance, is_cancelled, organization_id')
      .eq('id', id)
      .single()
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    if (payment.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (payment.is_cancelled) return NextResponse.json({ error: 'Cannot edit a cancelled payment' }, { status: 400 })

    // Cancellation — restricted to admin/owner/manager
    if (body.is_cancelled === true) {
      if (!['admin', 'owner', 'manager'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const cancellationReason = typeof body.cancelled_reason === 'string'
        ? body.cancelled_reason.trim()
        : ''
      if (!cancellationReason) {
        return NextResponse.json({ error: 'Cancellation reason is required' }, { status: 400 })
      }
      const { error: cancelError } = await supabase.rpc('cancel_customer_payment', {
        p_org_id: profile.organization_id,
        p_actor_id: user.id,
        p_payment_id: id,
        p_reason: cancellationReason,
      })
      if (cancelError) throw cancelError

      await logAudit({ orgId: profile.organization_id, userId: user.id, userName: profile.full_name, action: 'delete', entityType: 'payment', entityId: id, entityLabel: payment.payment_number })
      return NextResponse.json({ success: true })
    }

    // Allocation-only workflow — only admin/owner/manager.
    if (!['admin', 'owner', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (body.apply_to_invoice_id) {
      if (!payment.is_advance) {
        return NextResponse.json({ error: 'This payment is not an available advance' }, { status: 400 })
      }
      const { error: applyError } = await supabase.rpc('apply_customer_advance', {
        p_org_id: profile.organization_id,
        p_actor_id: user.id,
        p_payment_id: id,
        p_invoice_id: body.apply_to_invoice_id,
      })
      if (applyError) throw applyError

      await logAudit({ orgId: profile.organization_id, userId: user.id, userName: profile.full_name, action: 'update', entityType: 'payment', entityId: id, entityLabel: payment.payment_number })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { error: 'Posted payments cannot be edited; cancel and record a replacement payment instead' },
      { status: 409 },
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Payment PATCH error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
