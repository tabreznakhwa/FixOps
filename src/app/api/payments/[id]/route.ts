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

    const supabase = createAdminClient() as any
    const { data, error } = await supabase
      .from('payments')
      .select('id, payment_number, payment_date, amount_received, payment_mode, reference_number, notes, is_advance, is_cancelled, cancelled_reason, customers(id, full_name, mobile_number), invoices(id, invoice_number, total_amount)')
      .eq('id', id)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    return NextResponse.json({ payment: data })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
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

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users').select('organization_id, role').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const supabase = createAdminClient() as any

    // Fetch current payment
    const { data: payment } = await supabase
      .from('payments')
      .select('id, payment_number, amount_received, invoice_id, is_cancelled')
      .eq('id', id)
      .single()
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    if (payment.is_cancelled) return NextResponse.json({ error: 'Cannot edit a cancelled payment' }, { status: 400 })

    // Cancellation
    if (body.is_cancelled === true) {
      if (!body.cancelled_reason?.trim()) {
        return NextResponse.json({ error: 'Cancellation reason is required' }, { status: 400 })
      }
      await supabase.from('payments').update({
        is_cancelled: true,
        cancelled_reason: body.cancelled_reason.trim(),
        cancelled_by: user.id,
        cancelled_at: new Date().toISOString(),
      }).eq('id', id)

      // Restore invoice balance
      if (payment.invoice_id) {
        const { data: inv } = await supabase
          .from('invoices').select('total_amount, amount_paid').eq('id', payment.invoice_id).single()
        if (inv) {
          const newPaid = Math.max(0, Number(inv.amount_paid) - Number(payment.amount_received))
          const newBalance = Math.max(0, Number(inv.total_amount) - newPaid)
          const newStatus = newPaid <= 0 ? 'issued' : newPaid < inv.total_amount ? 'partial' : 'paid'
          await supabase.from('invoices').update({ amount_paid: newPaid, balance_due: newBalance, status: newStatus, updated_at: new Date().toISOString() }).eq('id', payment.invoice_id)
        }
      }

      await logAudit({ orgId: profile.organization_id, userId: user.id, action: 'delete', entityType: 'payment', entityId: id, entityLabel: payment.payment_number })
      return NextResponse.json({ success: true })
    }

    // Edit — only admin/owner/manager
    if (!['admin', 'owner', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { payment_date, payment_mode, reference_number, notes, amount_received } = body
    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (payment_date) updatePayload.payment_date = payment_date
    if (payment_mode) updatePayload.payment_mode = payment_mode
    if ('reference_number' in body) updatePayload.reference_number = reference_number?.trim() ?? null
    if ('notes' in body) updatePayload.notes = notes?.trim() ?? null

    // If amount changed, recalculate invoice balance
    if (amount_received !== undefined) {
      const newAmount = Number(amount_received)
      if (isNaN(newAmount) || newAmount <= 0) {
        return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })
      }
      updatePayload.amount_received = newAmount

      if (payment.invoice_id) {
        const { data: inv } = await supabase
          .from('invoices').select('total_amount, amount_paid').eq('id', payment.invoice_id).single()
        if (inv) {
          const oldAmount = Number(payment.amount_received)
          const newPaid = Math.max(0, Number(inv.amount_paid) - oldAmount + newAmount)
          const newBalance = Math.max(0, Number(inv.total_amount) - newPaid)
          const newStatus = newPaid <= 0 ? 'issued' : newPaid < inv.total_amount ? 'partial' : 'paid'
          await supabase.from('invoices').update({ amount_paid: newPaid, balance_due: newBalance, status: newStatus, updated_at: new Date().toISOString() }).eq('id', payment.invoice_id)
        }
      }
    }

    await supabase.from('payments').update(updatePayload).eq('id', id)
    await logAudit({ orgId: profile.organization_id, userId: user.id, action: 'update', entityType: 'payment', entityId: id, entityLabel: payment.payment_number })
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Payment PATCH error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
