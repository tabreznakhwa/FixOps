/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users').select('organization_id, role').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile || !['owner', 'admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const supabase = createAdminClient() as any

    if (body.action === 'cancel') {
      // Receiving an invoice adds stock. Cancelling it previously only flipped
      // the status, so the goods stayed on the books forever — stock that was
      // never really received, with a purchase still sitting in the ledger
      // explaining it. Cancelling must put the stock back.
      const { data: invoice } = await supabase
        .from('purchase_invoices')
        .select('id, invoice_number, status')
        .eq('id', id)
        .eq('organization_id', profile.organization_id)
        .single()

      if (!invoice) return NextResponse.json({ error: 'Purchase invoice not found' }, { status: 404 })
      if (invoice.status === 'cancelled') {
        // Reversing twice would take the stock away a second time.
        return NextResponse.json({ error: 'This purchase invoice is already cancelled.' }, { status: 400 })
      }

      const { data: lines } = await supabase
        .from('purchase_invoice_items')
        .select('inventory_item_id, quantity, unit_cost, description')
        .eq('purchase_invoice_id', id)
        .not('inventory_item_id', 'is', null)

      const items = (lines ?? []) as Array<{
        inventory_item_id: string; quantity: number; unit_cost: number; description: string
      }>

      // Refuse rather than drive stock negative: if the goods have already been
      // fitted to jobs, cancelling the invoice is the wrong correction and would
      // leave an impossible balance behind.
      const shortfalls: string[] = []
      const current = new Map<string, number>()
      for (const li of items) {
        const { data: inv } = await supabase
          .from('inventory_items')
          .select('item_name, current_stock')
          .eq('id', li.inventory_item_id)
          .single()
        if (!inv) continue
        const have = Number(inv.current_stock) || 0
        const need = Number(li.quantity) || 0
        current.set(li.inventory_item_id, have)
        if (have < need) shortfalls.push(`${inv.item_name} (have ${have}, invoice ${need})`)
      }
      if (shortfalls.length > 0) {
        return NextResponse.json({
          error: `Cannot cancel — stock has already been used: ${shortfalls.join('; ')}. Raise a stock adjustment instead.`,
        }, { status: 400 })
      }

      for (const li of items) {
        const qty = Number(li.quantity) || 0

        // Remove stock and record the ledger entry atomically, in one call
        // (adjust_inventory_stock_logged, migration 034) instead of a
        // SELECT-then-UPDATE-then-INSERT, so a failure partway through can't
        // leave stock changed with no matching ledger row.
        // (The shortfall check above using `current` is a best-effort pre-check,
        // not the source of truth — the RPC below is.)
        const { error: stockErr } = await supabase
          .rpc('adjust_inventory_stock_logged', {
            p_item_id: li.inventory_item_id,
            p_delta: -qty,
            p_org_id: profile.organization_id,
            p_transaction_type: 'adjustment',
            p_unit_cost: Number(li.unit_cost) || 0,
            p_reference_type: 'purchase_invoice_cancelled',
            p_reference_id: id,
            p_notes: `Reversal of cancelled Purchase Invoice ${invoice.invoice_number}`,
            p_created_by: user.id,
          })
          .single()
        if (stockErr) throw stockErr
      }

      const { error } = await supabase
        .from('purchase_invoices')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', profile.organization_id)
      if (error) throw error
      return NextResponse.json({ success: true, reversedItems: items.length })
    }

    if (body.action === 'update') {
      const allowed = ['invoice_date', 'due_date', 'payment_type', 'payment_mode', 'payment_status', 'notes', 'supplier_id']
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const key of allowed) {
        if (key in body) updates[key] = body[key] === '' ? null : body[key]
      }
      const { error } = await supabase.from('purchase_invoices').update(updates).eq('id', id).eq('organization_id', profile.organization_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('Purchase invoice PATCH error:', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
