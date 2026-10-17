import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'manager', 'accounts'])

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: workOrderId } = await params
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users')
      .select('organization_id, role, status')
      .eq('id', user.id)
      .single()
    const profile = profileRaw as {
      organization_id: string | null
      role: string
      status: string
    } | null
    if (!profile || profile.status !== 'active' || !profile.organization_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!ALLOWED_ROLES.has(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { amount, payment_mode, payment_date } = body as {
      amount: number
      payment_mode: string
      payment_date?: string
    }

    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }
    if (!payment_mode) {
      return NextResponse.json({ error: 'Payment mode required' }, { status: 400 })
    }
    if (!payment_date) {
      return NextResponse.json({ error: 'Payment date required' }, { status: 400 })
    }

    // Admin access is safe only after the caller's active tenant and finance role
    // are established. The RPC independently validates actor/customer/invoice org.
    const admin = createAdminClient() as any
    const { data: workOrder, error: workOrderError } = await admin
      .from('work_orders')
      .select('id, work_order_number, customer_id')
      .eq('id', workOrderId)
      .eq('organization_id', profile.organization_id)
      .single()

    if (workOrderError || !workOrder) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
    }
    if (!workOrder.customer_id) {
      return NextResponse.json({ error: 'No customer linked to this work order' }, { status: 400 })
    }

    // Prefer the posted invoice for this work order; absent an invoice, record an
    // unallocated customer payment and retain work_order_id below for later linking.
    const { data: invoice } = await admin
      .from('invoices')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('work_order_id', workOrderId)
      .in('status', ['issued', 'partial', 'overdue', 'paid'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: rpcResult, error: rpcError } = await admin.rpc('record_customer_payment', {
      p_org_id: profile.organization_id,
      p_actor_id: user.id,
      p_customer_id: workOrder.customer_id,
      p_invoice_id: invoice?.id ?? null,
      p_work_order_id: workOrderId,
      p_payment_date: payment_date,
      p_amount_received: Number(amount),
      p_payment_mode: payment_mode,
      p_reference_number: workOrder.work_order_number,
      p_notes: `Work order payment — ${workOrder.work_order_number}`,
      p_is_advance: false,
    })
    if (rpcError) throw rpcError

    const rows = Array.isArray(rpcResult) ? rpcResult : rpcResult ? [rpcResult] : []
    const posted = rows[0] as { payment_id?: string; payment_number?: string } | undefined
    if (!posted?.payment_id) {
      return NextResponse.json({ error: 'Payment could not be recorded' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      payment_number: posted.payment_number,
    })
  } catch (error: unknown) {
    console.error('Collect payment error:', error)
    const message = error instanceof Error ? error.message : 'Failed to record payment'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
