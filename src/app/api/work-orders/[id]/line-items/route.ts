/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

/**
 * Atomically apply a signed stock change AND record it in the
 * inventory_transactions ledger, in a single database round trip
 * (adjust_inventory_stock_logged, migration 034).
 *
 * This used to be two separate calls — adjust_inventory_stock (migration 032)
 * followed by a plain insert into inventory_transactions. Each was atomic on
 * its own, but the pair wasn't: if the ledger insert failed for any reason
 * after the stock change had already landed, current_stock moved with zero
 * audit trail. The old code even swallowed that failure on purpose ("a failed
 * ledger write must not undo a part that's already been issued and paid
 * for") — which is exactly what happened live to Compressor ZR-72: a clean
 * transaction history ending at stock_after = 1, then current_stock silently
 * at 0 forty minutes later with no matching row. Folding both into one RPC
 * call removes that window — they now succeed or fail together.
 */
async function adjustStockLogged(
  supabase: any,
  args: {
    itemId: string
    delta: number
    orgId: string
    type: 'issued' | 'returned' | 'adjustment'
    unitCost: number
    workOrderId: string
    userId: string
    notes?: string
  }
): Promise<{ before: number; after: number }> {
  const { data, error } = await supabase
    .rpc('adjust_inventory_stock_logged', {
      p_item_id: args.itemId,
      p_delta: args.delta,
      p_org_id: args.orgId,
      p_transaction_type: args.type,
      p_unit_cost: args.unitCost,
      p_reference_type: 'work_order',
      p_reference_id: args.workOrderId,
      p_notes: args.notes ?? null,
      p_created_by: args.userId,
    })
    .single()
  if (error) throw error
  return { before: Number(data.stock_before), after: Number(data.stock_after) }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: workOrderId } = await params
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { item_type, description, quantity, unit_price, inventory_item_id } = body as {
      item_type: 'custom' | 'part' | 'service'
      description: string
      quantity: number
      unit_price: number
      inventory_item_id?: string
    }

    if (!item_type || !description?.trim() || !quantity || quantity <= 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Get work order organization_id
    const { data: wo } = await (supabase as any)
      .from('work_orders')
      .select('organization_id')
      .eq('id', workOrderId)
      .single()
    if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

    // If part, validate and deduct inventory
    let resolvedPrice = unit_price
    let movement: { itemId: string; cost: number } | null = null
    if (item_type === 'part' && inventory_item_id) {
      const { data: invItem, error: invErr } = await (supabase as any)
        .from('inventory_items')
        .select('id, item_name, current_stock, selling_price, purchase_price, unit_of_measure')
        .eq('id', inventory_item_id)
        .single()

      if (invErr || !invItem) return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 })
      if (invItem.current_stock < quantity) {
        return NextResponse.json({
          error: `Insufficient stock. Available: ${invItem.current_stock} ${invItem.unit_of_measure}`,
        }, { status: 400 })
      }
      resolvedPrice = unit_price || invItem.selling_price

      // Deduct stock and record the ledger entry atomically.
      const cost = Number(invItem.purchase_price) || 0
      await adjustStockLogged(supabase, {
        itemId: inventory_item_id,
        delta: -quantity,
        orgId: wo.organization_id,
        type: 'issued',
        // Ledger records cost, not sale price — this is what feeds COGS.
        unitCost: cost,
        workOrderId,
        userId: user.id,
        notes: description?.trim() || undefined,
      })

      movement = { itemId: inventory_item_id, cost }
    }

    // Insert line item
    const { data: lineItem, error: insertErr } = await (supabase as any)
      .from('work_order_line_items')
      .insert({
        work_order_id: workOrderId,
        organization_id: wo.organization_id,
        item_type,
        description: description.trim(),
        quantity,
        unit_price: resolvedPrice,
        inventory_item_id: item_type === 'part' ? (inventory_item_id ?? null) : null,
        created_by: user.id,
      })
      .select('id, item_type, description, quantity, unit_price, inventory_item_id')
      .single()

    if (insertErr) {
      // Reverse the stock+ledger change if the line item never actually got
      // recorded. Best-effort: the line item insert has already failed, so
      // there's nothing further to protect by throwing over this too.
      if (movement) {
        await adjustStockLogged(supabase, {
          itemId: movement.itemId,
          delta: quantity,
          orgId: wo.organization_id,
          type: 'returned',
          unitCost: movement.cost,
          workOrderId,
          userId: user.id,
          notes: 'Rollback: line item insert failed',
        }).catch(err => console.error('stock rollback failed after insert error:', err))
      }
      throw insertErr
    }

    // Recalculate and persist final_amount (non-critical — don't fail the insert if this errors)
    try {
      const { data: allItems } = await (supabase as any)
        .from('work_order_line_items')
        .select('quantity, unit_price')
        .eq('work_order_id', workOrderId)

      const newTotal = (allItems ?? []).reduce(
        (s: number, i: { quantity: number; unit_price: number }) => s + i.quantity * i.unit_price, 0
      )
      await (supabase as any)
        .from('work_orders')
        .update({ final_amount: newTotal, updated_at: new Date().toISOString() })
        .eq('id', workOrderId)
    } catch (totalErr) {
      console.error('final_amount update failed (non-critical):', totalErr)
    }

    return NextResponse.json({ success: true, lineItem })
  } catch (err) {
    console.error('Add work order line item error:', err)
    return NextResponse.json({ error: 'Failed to add line item' }, { status: 500 })
  }
}

/**
 * Edit an existing line item's description, quantity or unit price.
 *
 * For parts, stock is adjusted by the DELTA between old and new quantity —
 * raising the qty takes more stock (and is refused if there isn't enough),
 * lowering it returns the difference. Re-deducting the full new quantity would
 * double-count against stock that was already taken when the item was added.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: workOrderId } = await params
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { line_item_id, description, quantity, unit_price } = body as {
      line_item_id: string
      description: string
      quantity: number
      unit_price: number
    }

    if (!line_item_id) return NextResponse.json({ error: 'Missing line_item_id' }, { status: 400 })
    if (!description?.trim()) return NextResponse.json({ error: 'Description is required' }, { status: 400 })
    if (!(quantity > 0)) return NextResponse.json({ error: 'Quantity must be greater than zero' }, { status: 400 })
    if (!(unit_price >= 0)) return NextResponse.json({ error: 'Unit price cannot be negative' }, { status: 400 })

    const supabase = createAdminClient()

    const { data: item, error: fetchErr } = await (supabase as any)
      .from('work_order_line_items')
      .select('id, item_type, quantity, inventory_item_id')
      .eq('id', line_item_id)
      .eq('work_order_id', workOrderId)
      .single()

    if (fetchErr || !item) return NextResponse.json({ error: 'Line item not found' }, { status: 404 })

    // Adjust stock by the difference before writing the new values.
    const delta = quantity - Number(item.quantity)
    let stockAdjusted = false
    let orgId: string | null = null
    let unitCost = 0
    if (item.item_type === 'part' && item.inventory_item_id && delta !== 0) {
      const { data: invItem } = await (supabase as any)
        .from('inventory_items')
        .select('current_stock, unit_of_measure, purchase_price')
        .eq('id', item.inventory_item_id)
        .single()

      if (!invItem) return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 })
      if (delta > 0 && invItem.current_stock < delta) {
        return NextResponse.json({
          error: `Insufficient stock to increase quantity. Available: ${invItem.current_stock} ${invItem.unit_of_measure}`,
        }, { status: 400 })
      }

      const { data: wo } = await (supabase as any)
        .from('work_orders').select('organization_id').eq('id', workOrderId).single()
      if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
      const woOrgId: string = wo.organization_id
      orgId = woOrgId
      unitCost = Number(invItem.purchase_price) || 0

      // Only the difference moves, so only the difference is recorded — stock
      // and ledger update together atomically.
      await adjustStockLogged(supabase, {
        itemId: item.inventory_item_id,
        delta: -delta,
        orgId: woOrgId,
        type: delta > 0 ? 'issued' : 'returned',
        unitCost,
        workOrderId,
        userId: user.id,
        notes: `Quantity changed on ${description.trim()}`,
      })
      stockAdjusted = true
    }

    const { data: updated, error: updateErr } = await (supabase as any)
      .from('work_order_line_items')
      .update({
        description: description.trim(),
        quantity,
        unit_price,
      })
      .eq('id', line_item_id)
      .eq('work_order_id', workOrderId)
      .select('id, item_type, description, quantity, unit_price, inventory_item_id')
      .single()

    if (updateErr) {
      // Put the stock back the way we found it so a failed edit can't leak inventory.
      if (stockAdjusted && item.inventory_item_id && orgId) {
        await adjustStockLogged(supabase, {
          itemId: item.inventory_item_id,
          delta,
          orgId,
          type: 'adjustment',
          unitCost,
          workOrderId,
          userId: user.id,
          notes: 'Rollback: line item update failed',
        }).catch(err => console.error('stock rollback failed after update error:', err))
      }
      throw updateErr
    }

    // Recalculate and persist final_amount (non-critical)
    try {
      const { data: allItems } = await (supabase as any)
        .from('work_order_line_items')
        .select('quantity, unit_price')
        .eq('work_order_id', workOrderId)

      const newTotal = (allItems ?? []).reduce(
        (s: number, i: { quantity: number; unit_price: number }) => s + i.quantity * i.unit_price, 0
      )
      await (supabase as any)
        .from('work_orders')
        .update({ final_amount: newTotal, updated_at: new Date().toISOString() })
        .eq('id', workOrderId)
    } catch (totalErr) {
      console.error('final_amount update failed (non-critical):', totalErr)
    }

    return NextResponse.json({ success: true, lineItem: updated })
  } catch (err) {
    console.error('Edit work order line item error:', err)
    return NextResponse.json({ error: 'Failed to update line item' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: workOrderId } = await params
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { line_item_id } = body as { line_item_id: string }
    if (!line_item_id) return NextResponse.json({ error: 'Missing line_item_id' }, { status: 400 })

    const supabase = createAdminClient()

    const { data: item, error: fetchErr } = await (supabase as any)
      .from('work_order_line_items')
      .select('id, item_type, quantity, inventory_item_id')
      .eq('id', line_item_id)
      .eq('work_order_id', workOrderId)
      .single()

    if (fetchErr || !item) return NextResponse.json({ error: 'Line item not found' }, { status: 404 })

    // Restore inventory stock if this was a part
    if (item.item_type === 'part' && item.inventory_item_id) {
      const { data: invItem } = await (supabase as any)
        .from('inventory_items').select('purchase_price').eq('id', item.inventory_item_id).single()

      const { data: wo } = await (supabase as any)
        .from('work_orders').select('organization_id').eq('id', workOrderId).single()
      if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

      // Stock coming back is a return, so the ledger nets to zero for a part
      // that was issued and then removed — stock and ledger update together
      // atomically.
      await adjustStockLogged(supabase, {
        itemId: item.inventory_item_id,
        delta: Number(item.quantity),
        orgId: wo.organization_id,
        type: 'returned',
        unitCost: Number(invItem?.purchase_price) || 0,
        workOrderId,
        userId: user.id,
        notes: 'Line item removed from work order',
      })
    }

    const { error: deleteErr } = await (supabase as any)
      .from('work_order_line_items')
      .delete()
      .eq('id', line_item_id)

    if (deleteErr) throw deleteErr

    // Recalculate and persist final_amount (non-critical)
    try {
      const { data: remaining } = await (supabase as any)
        .from('work_order_line_items')
        .select('quantity, unit_price')
        .eq('work_order_id', workOrderId)

      const newTotal = (remaining ?? []).reduce(
        (s: number, i: { quantity: number; unit_price: number }) => s + i.quantity * i.unit_price, 0
      )
      await (supabase as any)
        .from('work_orders')
        .update({ final_amount: newTotal, updated_at: new Date().toISOString() })
        .eq('id', workOrderId)
    } catch (totalErr) {
      console.error('final_amount update failed (non-critical):', totalErr)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Remove work order line item error:', err)
    return NextResponse.json({ error: 'Failed to remove line item' }, { status: 500 })
  }
}
