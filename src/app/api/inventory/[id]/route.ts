import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

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
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!['owner', 'admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

    const ALLOWED_FIELDS = [
      'item_name', 'category', 'brand', 'current_stock',
      'minimum_stock_level', 'purchase_price', 'selling_price',
      'storage_location', 'is_active',
    ]
    const updatePayload: Record<string, unknown> = {}

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        updatePayload[field] = body[field]
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Stock cannot be negative. The UI blocks it, but the UI is not the boundary —
    // a stock level below zero is meaningless and silently corrupts valuation and
    // every reconciliation built on top of it.
    if ('current_stock' in updatePayload) {
      const qty = Number(updatePayload.current_stock)
      if (!Number.isFinite(qty)) {
        return NextResponse.json({ error: 'Stock must be a number' }, { status: 400 })
      }
      if (qty < 0) {
        return NextResponse.json({ error: 'Stock cannot be negative' }, { status: 400 })
      }
      updatePayload.current_stock = qty
    }
    for (const priceField of ['purchase_price', 'selling_price', 'minimum_stock_level']) {
      if (priceField in updatePayload) {
        const v = Number(updatePayload[priceField])
        if (!Number.isFinite(v) || v < 0) {
          return NextResponse.json({ error: `${priceField.replace(/_/g, ' ')} cannot be negative` }, { status: 400 })
        }
        updatePayload[priceField] = v
      }
    }

    const supabase = createAdminClient()

    // current_stock is applied separately via the atomic set_inventory_stock
    // RPC (migration 032) instead of in the same UPDATE as the other fields —
    // a plain UPDATE here previously raced with any other concurrent stock
    // change (issue, receive, etc.) and could silently lose one of them.
    const desiredStock = 'current_stock' in updatePayload ? Number(updatePayload.current_stock) : null
    delete updatePayload.current_stock

    // Confirm the item belongs to this org before touching it — the admin
    // client bypasses RLS, so this check is the org boundary.
    const { data: existing, error: existingErr } = await (supabase as any)
      .from('inventory_items')
      .select('id, item_code, item_name, current_stock, is_active, purchase_price')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single()
    if (existingErr || !existing) return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 })

    if (Object.keys(updatePayload).length > 0) {
      const { error } = await (supabase as any)
        .from('inventory_items')
        .update({ ...updatePayload, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', profile.organization_id)
      if (error) throw error
    }

    if (desiredStock !== null) {
      const { before, after } = await (supabase as any)
        .rpc('set_inventory_stock', { p_item_id: id, p_new_stock: desiredStock })
        .single()
        .then(({ data, error }: any) => {
          if (error) throw error
          return { before: Number(data.stock_before), after: Number(data.stock_after) }
        })
      const delta = after - before
      if (delta !== 0) {
        try {
          await (supabase as any).from('inventory_transactions').insert({
            organization_id: profile.organization_id,
            item_id: id,
            transaction_type: 'adjustment',
            // Signed, so the trial balance can tell an increase from a decrease.
            quantity: delta,
            unit_cost: Number(existing.purchase_price) || 0,
            total_cost: Math.abs(delta) * (Number(existing.purchase_price) || 0),
            stock_before: before,
            stock_after: after,
            reference_type: 'manual_adjustment',
            notes: body.adjustment_reason?.toString().trim() || 'Manual stock adjustment',
            created_by: user.id,
          })
        } catch (ledgerErr) {
          // Never undo a completed stock change over a failed ledger write.
          console.error('inventory_transactions write failed (non-critical):', ledgerErr)
        }
      }
    }

    const { data: updated, error: refetchErr } = await (supabase as any)
      .from('inventory_items')
      .select('id, item_code, item_name, current_stock, is_active')
      .eq('id', id)
      .single()
    if (refetchErr) throw refetchErr

    return NextResponse.json({ success: true, item: updated })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Update inventory item error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
