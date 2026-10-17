import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await (supabaseUser as any)
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['owner', 'admin', 'manager', 'accounts'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const {
      customer_id,
      invoice_id,
      payment_date,
      amount_received,
      payment_mode,
      reference_number,
      notes,
      is_advance,
    } = body

    if (!customer_id) return NextResponse.json({ error: 'Customer is required' }, { status: 400 })
    if (!payment_date) return NextResponse.json({ error: 'Payment date is required' }, { status: 400 })
    if (!amount_received || Number(amount_received) <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })
    }
    if (!payment_mode) return NextResponse.json({ error: 'Payment mode is required' }, { status: 400 })

    const supabase = createAdminClient()

    const isAdvance = Boolean(is_advance)

    // Transactional, tenant-validating posting. The RPC validates the actor,
    // customer and invoice ownership/relationship, generates the sequence, posts
    // the payment + posting event + invoice/work-order status atomically.
    const { data: result, error: rpcError } = await (supabase as any).rpc('record_customer_payment', {
      p_org_id: profile.organization_id,
      p_actor_id: user.id,
      p_customer_id: customer_id,
      p_invoice_id: invoice_id ?? null,
      p_work_order_id: null,
      p_payment_date: payment_date,
      p_amount_received: Number(amount_received),
      p_payment_mode: payment_mode,
      p_reference_number: reference_number?.trim() ?? null,
      p_notes: notes?.trim() ?? null,
      p_is_advance: isAdvance,
    })

    if (rpcError) throw rpcError

    const rows = Array.isArray(result) ? result : result ? [result] : []
    const row = (rows[0] ?? null) as { payment_id?: string; payment_number?: string } | null
    if (!row?.payment_id) {
      return NextResponse.json({ error: 'Payment could not be recorded' }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: row.payment_id, paymentNumber: row.payment_number })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Create payment error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
