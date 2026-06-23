import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

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

    const { data: seqData } = await (supabase as any).rpc('generate_sequence_number', {
      p_org_id: profile.organization_id,
      p_type: 'payment',
      p_prefix: 'PMT',
    })
    const paymentNumber = seqData ?? `PMT-${Date.now()}`

    const isAdvance = Boolean(is_advance)

    const { data: payment, error: payError } = await (supabase as any)
      .from('payments')
      .insert({
        organization_id: profile.organization_id,
        payment_number: paymentNumber,
        customer_id,
        invoice_id: invoice_id ?? null,
        payment_date,
        amount_received: Number(amount_received),
        payment_mode,
        reference_number: reference_number?.trim() ?? null,
        notes: notes?.trim() ?? null,
        is_advance: isAdvance,
        advance_used_amount: 0,
        is_cancelled: false,
        received_by: user.id,
      })
      .select('id, payment_number')
      .single()

    if (payError) throw payError

    // Create ledger entry
    const { error: ledgerError } = await (supabase as any)
      .from('customer_ledger_entries')
      .insert({
        organization_id: profile.organization_id,
        customer_id,
        entry_date: payment_date,
        entry_type: isAdvance ? 'advance' : 'payment',
        debit_amount: 0,
        credit_amount: Number(amount_received),
        description: `${isAdvance ? 'Advance Payment' : 'Payment'} ${paymentNumber}${invoice_id ? '' : ''}`,
        reference_type: 'payment',
        reference_id: payment.id,
        created_by: user.id,
      })

    if (ledgerError) throw ledgerError

    return NextResponse.json({ success: true, id: payment.id, paymentNumber: payment.payment_number })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Create payment error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
