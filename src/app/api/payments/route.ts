import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { parseCustomerPaymentInput } from '@/lib/customerPayments'
import type { Database } from '@/types/database'

type Profile = Pick<
  Database['public']['Tables']['users']['Row'],
  'organization_id' | 'role' | 'status'
>
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

function rpcStatus(message: string) {
  if (/not found|does not belong/i.test(message)) return 404
  if (/already|exceeds|requires|cannot|cancelled|not open|no accounting posting/i.test(message)) {
    return 409
  }
  return 400
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await supabaseUser
      .from('users')
      .select('organization_id, role, status')
      .eq('id', user.id)
      .single()
    const profile = profileRaw as Profile | null

    if (!profile || profile.status !== 'active' || !profile.organization_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!['owner', 'admin', 'manager', 'accounts'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 })
    }

    const parsed = parseCustomerPaymentInput(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const input = parsed.value
    const supabase = createAdminClient()

    // The RPC repeats actor, tenant, customer/invoice relationship and balance
    // checks under row locks, then posts the receipt and AR events atomically.
    const { data: result, error: rpcError } = await (supabase as AccountingRpcClient).rpc('record_customer_payment', {
      p_org_id: profile.organization_id,
      p_actor_id: user.id,
      p_customer_id: input.customerId,
      p_invoice_id: input.invoiceId,
      p_work_order_id: null,
      p_payment_date: input.paymentDate,
      p_amount_received: input.amountReceived,
      p_payment_mode: input.paymentMode,
      p_reference_number: input.referenceNumber,
      p_notes: input.notes,
      p_is_advance: input.isAdvance,
      p_discount_amount: input.discountAmount,
    })

    if (rpcError) {
      return NextResponse.json(
        { error: rpcError.message },
        { status: rpcStatus(rpcError.message) },
      )
    }

    const rows = Array.isArray(result) ? result : result ? [result] : []
    const row = (rows[0] ?? null) as { payment_id?: string; payment_number?: string } | null
    if (!row?.payment_id) {
      return NextResponse.json({ error: 'Payment could not be recorded' }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: row.payment_id, paymentNumber: row.payment_number })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to record payment'
    console.error('Create payment error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
