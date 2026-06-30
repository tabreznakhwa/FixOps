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
    const { supplier_id, purchase_order_id, invoice_ids, opening_payable_ids, payment_date, amount_paid, payment_mode, reference_number, notes } = body

    if (!supplier_id) return NextResponse.json({ error: 'Supplier is required' }, { status: 400 })
    if (!amount_paid || Number(amount_paid) <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

    const admin = createAdminClient() as any
    const invoiceIds: string[] = Array.isArray(invoice_ids) ? invoice_ids.filter(Boolean) : []
    const payableIds: string[] = Array.isArray(opening_payable_ids) ? opening_payable_ids.filter(Boolean) : []

    // Pay against one or more purchase invoices / opening payables: allocate the amount across them oldest-first
    if (invoiceIds.length > 0 || payableIds.length > 0) {
      type Line = {
        type: 'invoice' | 'opening'; id: string; balance_due: number; date: string; label: string
        amount_paid?: number; total_amount?: number
      }
      const lines: Line[] = []

      if (invoiceIds.length > 0) {
        const { data: invoicesRaw } = await admin
          .from('purchase_invoices')
          .select('id, amount_paid, balance_due, total_amount, invoice_number, invoice_date')
          .in('id', invoiceIds)
          .eq('supplier_id', supplier_id)
        for (const inv of (invoicesRaw ?? [])) {
          lines.push({
            type: 'invoice', id: inv.id, balance_due: Number(inv.balance_due), date: inv.invoice_date,
            label: inv.invoice_number, amount_paid: Number(inv.amount_paid), total_amount: Number(inv.total_amount),
          })
        }
      }

      if (payableIds.length > 0) {
        const { data: payablesRaw } = await admin
          .from('opening_payables')
          .select('id, balance_due, bill_date, bill_ref')
          .in('id', payableIds)
          .eq('supplier_id', supplier_id)
        for (const op of (payablesRaw ?? [])) {
          lines.push({ type: 'opening', id: op.id, balance_due: Number(op.balance_due), date: op.bill_date, label: op.bill_ref })
        }
      }

      lines.sort((a, b) => a.date.localeCompare(b.date))

      const totalBalance = lines.reduce((s, l) => s + l.balance_due, 0)
      if (Number(amount_paid) > totalBalance + 0.001) {
        return NextResponse.json({ error: `Amount exceeds total selected balance (${totalBalance.toFixed(3)})` }, { status: 400 })
      }

      let remaining = Number(amount_paid)
      const paidLabels: string[] = []
      let firstPaymentId: string | null = null

      for (const line of lines) {
        if (remaining <= 0) break
        const applied = Math.min(remaining, line.balance_due)
        if (applied <= 0) continue

        if (line.type === 'invoice') {
          const newAmountPaid = (line.amount_paid ?? 0) + applied
          const newBalance = Math.max(0, (line.total_amount ?? 0) - newAmountPaid)
          const newStatus = newBalance <= 0.001 ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid'
          await admin.from('purchase_invoices').update({
            amount_paid: newAmountPaid,
            balance_due: newBalance,
            payment_status: newStatus,
          }).eq('id', line.id)
        } else {
          const newBalance = Math.max(0, line.balance_due - applied)
          await admin.from('opening_payables').update({ balance_due: newBalance }).eq('id', line.id)
        }

        const { data: payRow, error: payErr } = await admin
          .from('supplier_payments')
          .insert({
            organization_id: profile.organization_id,
            supplier_id,
            purchase_invoice_id: line.type === 'invoice' ? line.id : null,
            payment_date,
            amount_paid: applied,
            payment_mode: payment_mode || 'bank_transfer',
            reference_number: reference_number || (line.type === 'opening' ? line.label : null),
            notes: line.type === 'opening' ? `Opening payable payment — ${line.label}` : (notes || null),
            paid_by: user.id,
          })
          .select('id')
          .single()
        if (payErr) throw payErr
        firstPaymentId ??= payRow.id

        paidLabels.push(line.label)
        remaining -= applied
      }

      await logAudit({
        orgId: profile.organization_id,
        userId: user.id,
        userName: profile.full_name,
        action: 'create',
        entityType: 'vendor_payment',
        entityId: firstPaymentId ?? supplier_id,
        entityLabel: `Payment of ${amount_paid} to supplier against ${paidLabels.length > 1 ? 'bills' : 'bill'} ${paidLabels.join(', ')}`,
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
