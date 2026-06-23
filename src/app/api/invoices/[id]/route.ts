import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()

    const { data: invoice, error: invError } = await (supabase as any)
      .from('invoices')
      .select('*, customers(full_name, mobile_number, email, area, city), work_orders(work_order_number)')
      .eq('id', id)
      .single()

    if (invError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const { data: items } = await (supabase as any)
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', id)
      .order('sort_order')

    const { data: payments } = await (supabase as any)
      .from('payments')
      .select('id, payment_number, payment_date, amount_received, payment_mode, reference_number, notes, is_cancelled')
      .eq('invoice_id', id)
      .order('payment_date', { ascending: false })

    return NextResponse.json({
      invoice,
      items: items ?? [],
      payments: payments ?? [],
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Get invoice error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
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

    const { data: profile } = await (supabaseUser as any)
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()

    const ALLOWED_FIELDS = ['status', 'notes', 'terms_and_conditions', 'cancelled_reason', 'due_date']
    const updatePayload: Record<string, unknown> = {}

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        updatePayload[field] = body[field]
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Validate status transitions
    if (updatePayload.status === 'cancelled') {
      if (!body.cancelled_reason?.trim()) {
        return NextResponse.json({ error: 'Cancellation reason is required' }, { status: 400 })
      }
      updatePayload.cancelled_reason = body.cancelled_reason.trim()
    }

    const supabase = createAdminClient()

    const { data: updated, error } = await (supabase as any)
      .from('invoices')
      .update({ ...updatePayload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, invoice_number, status')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, invoice: updated })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Update invoice error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
