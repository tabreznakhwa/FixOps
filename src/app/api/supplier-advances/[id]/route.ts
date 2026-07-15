import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users').select('organization_id, role').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile || !['admin', 'owner', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const admin = createAdminClient() as any

    // Fetch advance — scoped to org
    const { data: advance } = await admin
      .from('supplier_advances')
      .select('id, advance_number, supplier_id, amount, amount_utilized, balance, is_cancelled, organization_id')
      .eq('id', id)
      .single()

    if (!advance) return NextResponse.json({ error: 'Advance not found' }, { status: 404 })
    if (advance.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (advance.is_cancelled) return NextResponse.json({ error: 'Advance is cancelled' }, { status: 400 })
    if (Number(advance.balance) <= 0) return NextResponse.json({ error: 'No balance remaining on this advance' }, { status: 400 })

    // Apply to purchase invoice
    if (body.apply_to_purchase_invoice_id) {
      const targetId = body.apply_to_purchase_invoice_id

      const { data: inv } = await admin
        .from('purchase_invoices')
        .select('id, total_amount, amount_paid, balance_due, payment_status, supplier_id, organization_id')
        .eq('id', targetId)
        .single()

      if (!inv) return NextResponse.json({ error: 'Purchase invoice not found' }, { status: 404 })
      if (inv.organization_id !== profile.organization_id) {
        return NextResponse.json({ error: 'Purchase invoice not found' }, { status: 404 })
      }
      if (inv.supplier_id !== advance.supplier_id) {
        return NextResponse.json({ error: 'Advance supplier does not match invoice supplier' }, { status: 400 })
      }
      if (Number(inv.balance_due) <= 0) {
        return NextResponse.json({ error: 'Invoice is already fully paid' }, { status: 400 })
      }

      const applied = Math.min(Number(advance.balance), Number(inv.balance_due))
      const newPaid = Math.min(Number(inv.total_amount), Number(inv.amount_paid) + applied)
      const newBalance = Math.max(0, Number(inv.total_amount) - newPaid)
      const newStatus = newBalance <= 0 ? 'paid' : newPaid > 0 ? 'partial' : inv.payment_status

      // Update purchase invoice
      await admin.from('purchase_invoices').update({
        amount_paid: newPaid,
        balance_due: newBalance,
        payment_status: newStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', targetId)

      // Update advance balance
      await admin.from('supplier_advances').update({
        amount_utilized: Number(advance.amount_utilized) + applied,
        balance: Number(advance.balance) - applied,
      }).eq('id', id)

      // Record a supplier_payment row for traceability
      await admin.from('supplier_payments').insert({
        organization_id: profile.organization_id,
        supplier_id: advance.supplier_id,
        purchase_invoice_id: targetId,
        payment_date: new Date().toISOString().split('T')[0],
        amount_paid: applied,
        payment_mode: 'advance',
        notes: `Applied from advance ${advance.advance_number}`,
        paid_by: user.id,
        supplier_advance_id: id,
      })

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'No action specified' }, { status: 400 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
