/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabase as any)
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['owner', 'admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const action = (body as Record<string, unknown>).action
    const reason = (body as Record<string, unknown>).reason
    if (action !== 'cancel') {
      return NextResponse.json({ error: 'Posted supplier payments cannot be edited; cancel and replace the payment instead' }, { status: 400 })
    }
    if (typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json({ error: 'Cancellation reason is required' }, { status: 400 })
    }

    const admin = createAdminClient() as any
    const { data: payment, error: paymentError } = await admin
      .from('supplier_payments')
      .select('id, purchase_order_id')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .maybeSingle()
    if (paymentError) {
      return NextResponse.json({ error: paymentError.message }, { status: 400 })
    }
    if (!payment) {
      return NextResponse.json({ error: 'Supplier payment not found' }, { status: 404 })
    }
    if (payment.purchase_order_id) {
      return NextResponse.json({
        error: 'This legacy payment is linked to a purchase order and must first be reconciled to a posted purchase invoice or supplier advance',
      }, { status: 409 })
    }

    const { data: result, error } = await admin.rpc('cancel_supplier_payment', {
      p_org_id: profile.organization_id,
      p_actor_id: user.id,
      p_supplier_payment_id: id,
      p_reason: reason.trim(),
    })
    if (error) {
      const status = /not found/i.test(error.message)
        ? 404
        : /already|cannot|must be unapplied|only be reversed|no accounting posting/i.test(error.message)
          ? 409
          : 400
      return NextResponse.json({ error: error.message }, { status })
    }

    const rows = Array.isArray(result) ? result : result ? [result] : []
    if (!rows[0]?.cancelled || !rows[0]?.posting_id) {
      return NextResponse.json({ error: 'Supplier payment could not be cancelled' }, { status: 500 })
    }
    return NextResponse.json({ success: true, reversedPostings: rows[0]?.reversed_postings ?? 0 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Cancellation failed'
    console.error('Cancel supplier payment error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
