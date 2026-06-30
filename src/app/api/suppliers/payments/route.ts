import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabase as any)
      .from('users')
      .select('organization_id, full_name, role')
      .eq('id', user.id)
      .single()
    const profile = profileRaw as { organization_id: string; full_name: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!['owner', 'admin', 'manager', 'accounts'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { supplier_id, purchase_order_id, invoice_ids, payment_date, amount_paid, payment_mode, reference_number, notes } = body

    if (!supplier_id) return NextResponse.json({ error: 'Supplier is required' }, { status: 400 })
    if (!amount_paid || Number(amount_paid) <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

    const admin = createAdminClient() as any
    const invoiceIds: string[] = Array.isArray(invoice_ids) ? invoice_ids.filter(Boolean) : []

    // Pay against one or more purchase invoices: allocate the amount across them oldest-first
    if (invoiceIds.length > 0) {
      const { data: invoicesRaw } = await admin
        .from('purchase_invoices')
        .select('id, amount_paid, balance_due, total_amount, invoice_number')
        .in('id', invoiceIds)
        .eq('supplier_id', supplier_id)
        .order('invoice_date', { ascending: true })

      const invoices = (invoicesRaw ?? []) as Array<{
        id: string; amount_paid: number; balance_due: number; total_amount: number; invoice_number: string
      }>

      const totalBalance = invoices.reduce((s, inv) => s + Number(inv.balance_due), 0)
      if (Number(amount_paid) > totalBalance + 0.001) {
        return NextResponse.json({ error: `Amount exceeds total selected invoice balance (${totalBalance.toFixed(3)})` }, { status: 400 })
      }

      let remaining = Number(amount_paid)
      const paidInvoiceNumbers: string[] = []
      let firstPaymentId: string | null = null

      for (const inv of invoices) {
        if (remaining <= 0) break
        const applied = Math.min(remaining, Number(inv.balance_due))
        if (applied <= 0) continue

        const newAmountPaid = Number(inv.amount_paid) + applied
        const newBalance = Math.max(0, Number(inv.total_amount) - newAmountPaid)
        const newStatus = newBalance <= 0.001 ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid'

        await admin.from('purchase_invoices').update({
          amount_paid: newAmountPaid,
          balance_due: newBalance,
          payment_status: newStatus,
        }).eq('id', inv.id)

        const { data: payRow, error: payErr } = await admin
          .from('supplier_payments')
          .insert({
            organization_id: profile.organization_id,
            supplier_id,
            purchase_invoice_id: inv.id,
            payment_date,
            amount_paid: applied,
            payment_mode: payment_mode || 'bank_transfer',
            reference_number: reference_number || null,
            notes: notes || null,
            paid_by: user.id,
          })
          .select('id')
          .single()
        if (payErr) throw payErr
        firstPaymentId ??= payRow.id

        paidInvoiceNumbers.push(inv.invoice_number)
        remaining -= applied
      }

      await logAudit({
        orgId: profile.organization_id,
        userId: user.id,
        userName: profile.full_name,
        action: 'create',
        entityType: 'vendor_payment',
        entityId: firstPaymentId ?? supplier_id,
        entityLabel: `Payment of ${amount_paid} to supplier against invoice${paidInvoiceNumbers.length > 1 ? 's' : ''} ${paidInvoiceNumbers.join(', ')}`,
      })

      return NextResponse.json({ id: firstPaymentId })
    }

    // Insert payment (general, or linked to a single PO)
    const { data: payment, error: payErr } = await admin
      .from('supplier_payments')
      .insert({
        organization_id: profile.organization_id,
        supplier_id,
        purchase_order_id: purchase_order_id || null,
        payment_date,
        amount_paid: Number(amount_paid),
        payment_mode: payment_mode || 'bank_transfer',
        reference_number: reference_number || null,
        notes: notes || null,
        paid_by: user.id,
      })
      .select('id')
      .single()

    if (payErr) throw payErr

    // Update purchase_order balance if linked
    if (purchase_order_id) {
      const { data: poRaw } = await admin
        .from('purchase_orders')
        .select('amount_paid, balance_due, total_amount')
        .eq('id', purchase_order_id)
        .single()

      if (poRaw) {
        const newAmountPaid = Number(poRaw.amount_paid) + Number(amount_paid)
        const newBalance = Number(poRaw.total_amount) - newAmountPaid
        const newPaymentStatus = newBalance <= 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid'

        await admin.from('purchase_orders').update({
          amount_paid: newAmountPaid,
          balance_due: Math.max(0, newBalance),
          payment_status: newPaymentStatus,
        }).eq('id', purchase_order_id)
      }
    }

    await logAudit({
      orgId: profile.organization_id,
      userId: user.id,
      userName: profile.full_name,
      action: 'create',
      entityType: 'vendor_payment',
      entityId: payment.id,
      entityLabel: `Payment of ${amount_paid} to supplier`,
    })

    return NextResponse.json({ id: payment.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
