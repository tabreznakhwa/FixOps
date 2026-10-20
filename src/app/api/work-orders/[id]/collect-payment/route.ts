import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { canTechnicianCollectWorkOrderPayment } from '@/lib/workOrderAccess'
import type { Database } from '@/types/database'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'manager', 'accounts'])
type CustomerPaymentArgs = Database['public']['Functions']['record_customer_payment']['Args']
type CustomerPaymentResult = Database['public']['Functions']['record_customer_payment']['Returns']

type AccountingRpcClient = SupabaseClient<Database> & {
  rpc(
    fn: 'record_customer_payment',
    args: CustomerPaymentArgs,
  ): PromiseLike<{
    data: CustomerPaymentResult | null
    error: { message: string } | null
  }>
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: workOrderId } = await params
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: profileRaw } = await admin
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
    // A technician may collect cash on their own assigned job (the common
    // field-service pattern), but nothing else: other payment modes and
    // other technicians' jobs stay restricted to owner/admin/manager/accounts.
    const isTechnician = profile.role === 'technician'
    if (!ALLOWED_ROLES.has(profile.role) && !isTechnician) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { amount, payment_mode, payment_date } = body as {
      amount: number
      payment_mode: string
      payment_date?: string
    }
    const parsedAmount = Number(amount)

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
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
    const { data: workOrderRaw, error: workOrderError } = await admin
      .from('work_orders')
      .select('id, work_order_number, customer_id, assigned_to, assigned_staff_id, payment_status, final_amount')
      .eq('id', workOrderId)
      .eq('organization_id', profile.organization_id)
      .single()
    const workOrder = workOrderRaw as {
      id: string
      work_order_number: string
      customer_id: string | null
      assigned_to: string | null
      assigned_staff_id: string | null
      payment_status: string
      final_amount: number
    } | null

    if (workOrderError || !workOrder) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
    }
    if (!workOrder.customer_id) {
      return NextResponse.json({ error: 'No customer linked to this work order' }, { status: 400 })
    }
    if (workOrder.payment_status === 'paid') {
      return NextResponse.json({ error: 'This work order is already paid' }, { status: 409 })
    }
    if (isTechnician) {
      const { data: ownStaffRaw } = await admin
        .from('staff')
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', profile.organization_id)
        .eq('employment_status', 'active')
        .maybeSingle()
      const ownStaff = ownStaffRaw as { id: string } | null
      const canCollect = canTechnicianCollectWorkOrderPayment({
        paymentMode: payment_mode,
        userId: user.id,
        staffId: ownStaff?.id ?? null,
        workOrder,
      })
      if (!canCollect) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // A non-cancelled invoice is authoritative once it exists. Select its status
    // before choosing the allocation path so a stale work-order snapshot cannot
    // turn a second receipt into an invoice-unlinked payment.
    const { data: invoiceRaw, error: invoiceError } = await admin
      .from('invoices')
      .select('id, status')
      .eq('organization_id', profile.organization_id)
      .eq('work_order_id', workOrderId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (invoiceError) throw invoiceError
    const invoice = invoiceRaw as { id: string; status: string } | null
    if (invoice?.status === 'paid') {
      return NextResponse.json({ error: 'This work order is already paid' }, { status: 409 })
    }
    if (invoice && !['issued', 'partial', 'overdue'].includes(invoice.status)) {
      return NextResponse.json(
        { error: 'Payments require an issued invoice' },
        { status: 409 },
      )
    }
    if (!invoice) {
      if (Number(workOrder.final_amount) <= 0) {
        return NextResponse.json(
          { error: 'Set a positive work order total before collecting payment' },
          { status: 409 },
        )
      }

      const { data: priorReceiptsRaw, error: priorReceiptsError } = await admin
        .from('payments')
        .select('amount_received')
        .eq('organization_id', profile.organization_id)
        .eq('work_order_id', workOrderId)
        .is('invoice_id', null)
        .eq('is_cancelled', false)
        .eq('is_advance', false)
      if (priorReceiptsError) throw priorReceiptsError
      const priorReceipts = (priorReceiptsRaw ?? []) as Array<{ amount_received: number }>
      const amountAlreadyCollected = priorReceipts.reduce(
        (sum, receipt) => sum + Number(receipt.amount_received || 0),
        0,
      )
      if (amountAlreadyCollected + parsedAmount > Number(workOrder.final_amount)) {
        return NextResponse.json(
          { error: 'Payment exceeds the work order amount' },
          { status: 409 },
        )
      }
    }

    const { data: rpcResult, error: rpcError } = await (admin as AccountingRpcClient).rpc(
      'record_customer_payment',
      {
        p_org_id: profile.organization_id,
        p_actor_id: user.id,
        p_customer_id: workOrder.customer_id,
        p_invoice_id: invoice?.id ?? null,
        p_work_order_id: workOrderId,
        p_payment_date: payment_date,
        p_amount_received: parsedAmount,
        p_payment_mode: payment_mode,
        p_reference_number: workOrder.work_order_number,
        p_notes: `Work order payment — ${workOrder.work_order_number}`,
        p_is_advance: false,
        p_discount_amount: 0,
      },
    )
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
