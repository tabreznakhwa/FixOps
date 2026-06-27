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

    // Full edit (admin/owner/manager only)
    if (body.items !== undefined) {
      if (!['admin', 'owner', 'manager'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const { customer_id, invoice_type, invoice_date, due_date, work_order_id, discount_amount, notes, terms_and_conditions, items } = body

      if (!customer_id) return NextResponse.json({ error: 'Customer is required' }, { status: 400 })
      if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })

      const supabaseAdmin = createAdminClient() as any
      const { data: existing } = await supabaseAdmin
        .from('invoices').select('id, invoice_number, status, amount_paid').eq('id', id).single()
      if (!existing) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      if (['cancelled', 'paid'].includes(existing.status)) return NextResponse.json({ error: 'Cannot edit a paid or cancelled invoice' }, { status: 400 })

      const subtotal = items.reduce((sum: number, it: { quantity: number; unit_price: number }) => sum + it.quantity * it.unit_price, 0)
      const discountAmt = Math.max(0, Number(discount_amount ?? 0))
      const totalAmount = Math.max(0, subtotal - discountAmt)
      const balanceDue = Math.max(0, totalAmount - Number(existing.amount_paid ?? 0))

      const { error: invErr } = await supabaseAdmin.from('invoices').update({
        customer_id, invoice_type: invoice_type ?? 'service', invoice_date,
        due_date: due_date ?? null, work_order_id: work_order_id ?? null,
        subtotal, discount_amount: discountAmt, total_amount: totalAmount, balance_due: balanceDue,
        notes: notes?.trim() ?? null, terms_and_conditions: terms_and_conditions?.trim() ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (invErr) throw invErr

      await supabaseAdmin.from('invoice_items').delete().eq('invoice_id', id)
      const lineItemRows = items.map((it: { description: string; quantity: number; unit_price: number }, idx: number) => {
        const qty = Number(it.quantity) || 1
        const unitPrice = Number(it.unit_price) || 0
        return { organization_id: profile.organization_id, invoice_id: id, description: it.description.trim(), quantity: qty, unit_price: unitPrice, discount_percent: 0, tax_percent: 0, line_total: qty * unitPrice, total_price: qty * unitPrice, sort_order: idx }
      })
      const { error: itemsErr } = await supabaseAdmin.from('invoice_items').insert(lineItemRows)
      if (itemsErr) throw itemsErr

      await logAudit({ orgId: profile.organization_id, userId: user.id, action: 'update', entityType: 'invoice', entityId: id, entityLabel: `${existing.invoice_number} — KWD ${totalAmount.toFixed(3)}` })
      return NextResponse.json({ success: true, id })
    }

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
