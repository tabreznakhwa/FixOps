/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

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
    if (item_type === 'part' && inventory_item_id) {
      const { data: invItem, error: invErr } = await (supabase as any)
        .from('inventory_items')
        .select('id, item_name, current_stock, selling_price, unit_of_measure')
        .eq('id', inventory_item_id)
        .single()

      if (invErr || !invItem) return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 })
      if (invItem.current_stock < quantity) {
        return NextResponse.json({
          error: `Insufficient stock. Available: ${invItem.current_stock} ${invItem.unit_of_measure}`,
        }, { status: 400 })
      }
      resolvedPrice = unit_price || invItem.selling_price

      // Deduct stock
      const { error: stockErr } = await (supabase as any)
        .from('inventory_items')
        .update({ current_stock: invItem.current_stock - quantity, updated_at: new Date().toISOString() })
        .eq('id', inventory_item_id)
      if (stockErr) throw stockErr
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
        const { data: invItem } = await (supabase as any)
          .from('inventory_items').select('current_stock').eq('id', inventory_item_id).single()
        if (invItem) {
          await (supabase as any).from('inventory_items')
            .update({ current_stock: invItem.current_stock + quantity, updated_at: new Date().toISOString() })
            .eq('id', inventory_item_id)
        }
      }
      throw insertErr
    }

    // Recalculate and persist final_amount
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

    return NextResponse.json({ success: true, lineItem })
  } catch (err) {
    console.error('Add work order line item error:', err)
    return NextResponse.json({ error: 'Failed to add line item' }, { status: 500 })
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
        .from('inventory_items').select('current_stock').eq('id', item.inventory_item_id).single()
      if (invItem) {
        await (supabase as any).from('inventory_items')
          .update({ current_stock: invItem.current_stock + item.quantity, updated_at: new Date().toISOString() })
          .eq('id', item.inventory_item_id)
      }
    }

    const { error: deleteErr } = await (supabase as any)
      .from('work_order_line_items')
      .delete()
      .eq('id', line_item_id)

    if (deleteErr) throw deleteErr

    // Recalculate and persist final_amount
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

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Remove work order line item error:', err)
    return NextResponse.json({ error: 'Failed to remove line item' }, { status: 500 })
  }
}
