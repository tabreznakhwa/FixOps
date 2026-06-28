import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: workOrderId } = await params
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { amount, payment_mode, payment_date } = body as {
      amount: number; payment_mode: string; payment_date: string
    }

    if (!amount || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    if (!payment_mode) return NextResponse.json({ error: 'Payment mode required' }, { status: 400 })

    const supabase = createAdminClient() as any

    // Get work order — need customer_id, organization_id, final_amount
    const { data: wo, error: woErr } = await supabase
      .from('work_orders')
      .select('id, work_order_number, customer_id, organization_id, final_amount, payment_status')
      .eq('id', workOrderId)
      .single()

    if (woErr || !wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
    if (!wo.customer_id) return NextResponse.json({ error: 'No customer linked to this work order' }, { status: 400 })

    const pDate = payment_date || new Date().toISOString().split('T')[0]

    // Generate payment number
    let paymentNumber = `WO-PAY-${Date.now()}`
    try {
      const { data: seqData } = await supabase.rpc('generate_sequence_number', {
        p_organization_id: wo.organization_id,
        p_type: 'payment',
      })
      if (seqData) paymentNumber = seqData
    } catch { /* fall back to timestamp */ }

    // Insert payment into payments table (feeds Cash Book / Bank Book)
    const { error: payErr } = await supabase
      .from('payments')
      .insert({
        organization_id: wo.organization_id,
        customer_id: wo.customer_id,
        payment_number: paymentNumber,
        payment_date: pDate,
        amount_received: amount,
        payment_mode,
        notes: `Work order payment — ${wo.work_order_number}`,
        is_advance: false,
        is_cancelled: false,
        received_by: user.id,
      })

    if (payErr) throw payErr

    // Insert into customer_ledger_entries
    await supabase
      .from('customer_ledger_entries')
      .insert({
        organization_id: wo.organization_id,
        customer_id: wo.customer_id,
        entry_date: pDate,
        entry_type: 'payment',
        credit: amount,
        debit: 0,
        description: `Payment — ${wo.work_order_number} (${payment_mode.replace(/_/g, ' ')})`,
        reference_number: paymentNumber,
      })

    // Determine new payment_status
    const finalAmount = wo.final_amount ?? 0
    const newStatus = amount >= finalAmount && finalAmount > 0 ? 'paid' : 'partial'

    await supabase
      .from('work_orders')
      .update({ payment_status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', workOrderId)

    return NextResponse.json({ success: true, payment_number: paymentNumber, payment_status: newStatus })
  } catch (err) {
    console.error('Collect payment error:', err)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }
}
