/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

/**
 * Records a stock movement in the inventory_transactions ledger.
 *
 * Purchases have always written to this ledger but issues never did — parts
 * going out on a job just decremented inventory_items.current_stock. That left
 * Stock Trial reporting zero issued no matter how much stock moved, produced
 * impossible negative opening balances (opening is derived as closing minus
 * recorded movements), and left the cost of parts out of profit reporting.
 *
 * Non-fatal: a failed ledger write must not undo a part that has already been
 * issued and paid for, so it is logged rather than thrown.
 */
/**
 * Atomically apply a signed stock change via the adjust_inventory_stock RPC
 * (migration 032) instead of a SELECT-then-UPDATE, so two requests touching
 * the same item's stock at once can't silently lose one of the changes.
 */
async function adjustStock(
  supabase: any,
  itemId: string,
  delta: number
): Promise<{ before: number; after: number }> {
  const { data, error } = await supabase
    .rpc('adjust_inventory_stock', { p_item_id: itemId, p_delta: delta })
    .single()
  if (error) throw error
  return { before: Number(data.stock_before), after: Number(data.stock_after) }
}

async function recordStockMovement(
  supabase: any,
  args: {
    orgId: string
    itemId: string
    type: 'issued' | 'returned' | 'adjustment'
    quantity: number
    unitCost: number
    stockBefore: number
    stockAfter: number
    workOrderId: string
    userId: string
    notes?: string
  }
) {
  try {
    await supabase.from('inventory_transactions').insert({
      organization_id: args.orgId,
      item_id: args.itemId,
      transaction_type: args.type,
      quantity: Math.abs(args.quantity),
      unit_cost: args.unitCost,
      total_cost: Math.abs(args.quantity) * args.unitCost,
      stock_before: args.stockBefore,
      stock_after: args.stockAfter,
      reference_type: 'work_order',
      reference_id: args.workOrderId,
      notes: args.notes ?? null,
      created_by: args.userId,
    })
  } catch (err) {
    console.error('inventory_transactions write failed (non-critical):', err)
  }
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
    let movement: { itemId: string; before: number; after: number; cost: number } | null = null
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

      // Deduct stock atomically.
      const { before, after } = await adjustStock(supabase, inventory_item_id, -quantity)

      movement = {
        itemId: inventory_item_id,
        before,
        after,
        // Ledger records cost, not sale price — this is what feeds COGS.
        cost: Number(invItem.purchase_price) || 0,
      }
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
      // Rollback stock if insert failed
      if (item_type === 'part' && inventory_item_id) {
        await adjustStock(supabase, inventory_item_id, quantity).catch(err =>
          console.error('stock rollback failed after insert error:', err)
        )
      }
      throw insertErr
    }

    if (movement) {
      await recordStockMovement(supabase, {
        orgId: wo.organization_id,
        itemId: movement.itemId,
        type: 'issued',
        quantity,
        unitCost: movement.cost,
        stockBefore: movement.before,
        stockAfter: movement.after,
        workOrderId,
        userId: user.id,
        notes: description?.trim() || undefined,
      })
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

      const { before, after } = await adjustStock(supabase, item.inventory_item_id, -delta)
      stockAdjusted = true

      // Only the difference moves, so only the difference is recorded.
      const { data: wo } = await (supabase as any)
        .from('work_orders').select('organization_id').eq('id', workOrderId).single()
      if (wo) {
        await recordStockMovement(supabase, {
          orgId: wo.organization_id,
          itemId: item.inventory_item_id,
          type: delta > 0 ? 'issued' : 'returned',
          quantity: Math.abs(delta),
          unitCost: Number(invItem.purchase_price) || 0,
          stockBefore: before,
          stockAfter: after,
          workOrderId,
          userId: user.id,
          notes: `Quantity changed on ${description.trim()}`,
        })
      }
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
      if (stockAdjusted && item.inventory_item_id) {
        await adjustStock(supabase, item.inventory_item_id, delta).catch(err =>
          console.error('stock rollback failed after update error:', err)
        )
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

      const { before, after } = await adjustStock(supabase, item.inventory_item_id, Number(item.quantity))

      // Stock coming back is a return, so the ledger nets to zero for a part
      // that was issued and then removed.
      const { data: wo } = await (supabase as any)
        .from('work_orders').select('organization_id').eq('id', workOrderId).single()
      if (wo) {
        await recordStockMovement(supabase, {
          orgId: wo.organization_id,
          itemId: item.inventory_item_id,
          type: 'returned',
          quantity: Number(item.quantity),
          unitCost: Number(invItem?.purchase_price) || 0,
          stockBefore: before,
          stockAfter: after,
          workOrderId,
          userId: user.id,
          notes: 'Line item removed from work order',
        })
      }
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
