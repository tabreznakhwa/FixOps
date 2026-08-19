/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: workOrderId } = await params
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { inventory_item_id, quantity_used } = body as { inventory_item_id: string; quantity_used: number }

    if (!inventory_item_id || !quantity_used || quantity_used <= 0) {
      return NextResponse.json({ error: 'Invalid part data' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Get current inventory item stock and price
    const { data: item, error: itemErr } = await (supabase as any)
      .from('inventory_items')
      .select('id, item_name, current_stock, selling_price, unit_of_measure')
      .eq('id', inventory_item_id)
      .single()

    if (itemErr || !item) return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 })

    if (item.current_stock < quantity_used) {
      return NextResponse.json({
        error: `Insufficient stock. Available: ${item.current_stock} ${item.unit_of_measure}`,
      }, { status: 400 })
    }

    // Insert into work_order_parts
    const { data: part, error: partErr } = await (supabase as any)
      .from('work_order_parts')
      .insert({
        work_order_id: workOrderId,
        inventory_item_id,
        quantity_used,
        unit_price: item.selling_price,
        item_name_snapshot: item.item_name,
        created_by: user.id,
      })
      .select('id, inventory_item_id, quantity_used, unit_price, item_name_snapshot')
      .single()

    if (partErr) throw partErr

    // Deduct from inventory stock, atomically.
    let before: number, after: number
    try {
      ;({ before, after } = await adjustStock(supabase, inventory_item_id, -quantity_used))
    } catch (stockErr) {
      // Rollback: delete the part we just inserted
      await (supabase as any).from('work_order_parts').delete().eq('id', part.id)
      throw stockErr
    }

    // Record in the shared ledger (this legacy path never used to log here at all).
    const { data: wo } = await (supabase as any)
      .from('work_orders').select('organization_id').eq('id', workOrderId).single()
    if (wo) {
      await (supabase as any).from('inventory_transactions').insert({
        organization_id: wo.organization_id,
        item_id: inventory_item_id,
        transaction_type: 'issued',
        quantity: quantity_used,
        unit_cost: 0,
        total_cost: 0,
        stock_before: before,
        stock_after: after,
        reference_type: 'work_order',
        reference_id: workOrderId,
        notes: 'Part added via legacy work_order_parts endpoint',
        created_by: user.id,
      }).then(null, (err: unknown) => console.error('inventory_transactions write failed (non-critical):', err))
    }

    return NextResponse.json({ success: true, part })
  } catch (err) {
    console.error('Add work order part error:', err)
    return NextResponse.json({ error: 'Failed to add part' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: workOrderId } = await params
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { part_id } = body as { part_id: string }

    if (!part_id) return NextResponse.json({ error: 'Missing part_id' }, { status: 400 })

    const supabase = createAdminClient()

    // Fetch the part to know how much stock to restore
    const { data: part, error: partErr } = await (supabase as any)
      .from('work_order_parts')
      .select('id, inventory_item_id, quantity_used')
      .eq('id', part_id)
      .eq('work_order_id', workOrderId)
      .single()

    if (partErr || !part) return NextResponse.json({ error: 'Part not found' }, { status: 404 })

    // Restore inventory stock, atomically.
    const { before, after } = await adjustStock(supabase, part.inventory_item_id, Number(part.quantity_used))

    const { data: wo } = await (supabase as any)
      .from('work_orders').select('organization_id').eq('id', workOrderId).single()
    if (wo) {
      await (supabase as any).from('inventory_transactions').insert({
        organization_id: wo.organization_id,
        item_id: part.inventory_item_id,
        transaction_type: 'returned',
        quantity: Number(part.quantity_used),
        unit_cost: 0,
        total_cost: 0,
        stock_before: before,
        stock_after: after,
        reference_type: 'work_order',
        reference_id: workOrderId,
        notes: 'Part removed via legacy work_order_parts endpoint',
        created_by: user.id,
      }).then(null, (err: unknown) => console.error('inventory_transactions write failed (non-critical):', err))
    }

    // Delete the part record
    const { error: deleteErr } = await (supabase as any)
      .from('work_order_parts')
      .delete()
      .eq('id', part_id)

    if (deleteErr) throw deleteErr

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Remove work order part error:', err)
    return NextResponse.json({ error: 'Failed to remove part' }, { status: 500 })
  }
}
