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

    const { data: getProfileRaw } = await (supabaseUser as any)
      .from('users').select('organization_id').eq('id', user.id).single()
    const getProfile = getProfileRaw as { organization_id: string } | null
    if (!getProfile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()

    const { data: invoice, error: invError } = await (supabase as any)
      .from('invoices')
      .select('*, customers(full_name, mobile_number, email, area, city), work_orders(work_order_number)')
      .eq('id', id)
      .eq('organization_id', getProfile.organization_id)
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await (supabaseUser as any)
      .from('users').select('organization_id, role, full_name').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['admin', 'owner', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = createAdminClient() as any
    const { data: inv } = await supabase
      .from('invoices').select('id, invoice_number, status, amount_paid, organization_id').eq('id', id).single()
    if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    if (inv.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (inv.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft invoices can be deleted. To cancel a sent invoice, use the Cancel option.' }, { status: 400 })
    }
    if (Number(inv.amount_paid) > 0) {
      return NextResponse.json({ error: 'Cannot delete an invoice with payments recorded' }, { status: 400 })
    }

    // Posted source invoices cannot be restored after their cancellation reversal.
    // A merged draft can be discarded, but its source accounting history stays
    // immutable and any correction must be a new replacement document.
    await supabase.from('invoice_items').delete().eq('invoice_id', id)
    await supabase.from('invoices').delete().eq('id', id)

    await logAudit({ orgId: profile.organization_id, userId: user.id, userName: profile.full_name, action: 'delete', entityType: 'invoice', entityId: id, entityLabel: inv.invoice_number })
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
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
      .select('organization_id, role, full_name')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()

    // Full edit (admin/owner/manager only)
    if (body.items !== undefined) {
      if (!['admin', 'owner', 'manager'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const { customer_id, invoice_type, invoice_date, due_date, work_order_id, ref_number, discount_amount, notes, terms_and_conditions, items } = body

      if (!customer_id) return NextResponse.json({ error: 'Customer is required' }, { status: 400 })
      if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })

      const supabaseAdmin = createAdminClient() as any
      const { data: existing } = await supabaseAdmin
        .from('invoices').select('id, invoice_number, status, amount_paid, organization_id').eq('id', id).single()
      if (!existing) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      if (existing.organization_id !== profile.organization_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (existing.status !== 'draft') {
        return NextResponse.json(
          { error: 'Posted invoice financials are immutable; cancel and create a replacement invoice' },
          { status: 400 },
        )
      }

      const subtotal = items.reduce((sum: number, it: { quantity: number; unit_price: number }) => sum + it.quantity * it.unit_price, 0)
      const discountAmt = Math.max(0, Number(discount_amount ?? 0))
      const totalAmount = Math.max(0, subtotal - discountAmt)
      const balanceDue = Math.max(0, totalAmount - Number(existing.amount_paid ?? 0))

      const { error: invErr } = await supabaseAdmin.from('invoices').update({
        customer_id, invoice_type: invoice_type ?? 'service', invoice_date,
        due_date: due_date ?? null, work_order_id: work_order_id ?? null, ref_number: ref_number?.trim() ?? null,
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

      await logAudit({ orgId: profile.organization_id, userId: user.id, userName: profile.full_name, action: 'update', entityType: 'invoice', entityId: id, entityLabel: `${existing.invoice_number} — KWD ${totalAmount.toFixed(3)}` })
      return NextResponse.json({ success: true, id })
    }

    if (!['admin', 'owner', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const ALLOWED_FIELDS = ['status', 'notes', 'terms_and_conditions', 'due_date', 'invoice_date']
    const updatePayload: Record<string, unknown> = {}

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        updatePayload[field] = body[field]
      }
    }

    // Work-order linkage does not change the posted AR amount or party, but all
    // writes remain tenant-scoped below.
    if ('work_order_id' in body && ['admin', 'owner', 'manager'].includes(profile.role)) {
      updatePayload.work_order_id = body.work_order_id ?? null
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Posted status transitions are transactional accounting operations, not
    // ordinary row updates. The RPCs validate tenant, actor and current state and
    // append the immutable posting/reversal event atomically.
    const supabase = createAdminClient() as any
    if (updatePayload.status === 'issued') {
      const { error } = await supabase.rpc('issue_customer_invoice', {
        p_org_id: profile.organization_id,
        p_actor_id: user.id,
        p_invoice_id: id,
      })
      if (error) throw error
      return NextResponse.json({ success: true })
    }
    if (updatePayload.status === 'cancelled') {
      if (!body.cancelled_reason?.trim()) {
        return NextResponse.json({ error: 'Cancellation reason is required' }, { status: 400 })
      }
      const { error } = await supabase.rpc('cancel_customer_invoice', {
        p_org_id: profile.organization_id,
        p_actor_id: user.id,
        p_invoice_id: id,
        p_reason: body.cancelled_reason.trim(),
      })
      if (error) throw error
      return NextResponse.json({ success: true })
    }
    if (updatePayload.status) {
      return NextResponse.json({ error: 'Unsupported invoice status transition' }, { status: 400 })
    }

    const { data: currentInvoice } = await supabase
      .from('invoices')
      .select('status')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single()
    if (!currentInvoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    if (currentInvoice.status !== 'draft' && 'invoice_date' in updatePayload) {
      return NextResponse.json(
        { error: 'Posted invoice date is immutable; cancel and create a replacement invoice' },
        { status: 400 },
      )
    }

    const { data: updated, error } = await supabase
      .from('invoices')
      .update({ ...updatePayload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
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
