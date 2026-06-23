import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: poId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabase as any)
      .from('users')
      .select('organization_id, full_name')
      .eq('id', user.id)
      .single()
    const profile = profileRaw as { organization_id: string; full_name: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { action, status, supplier_invoice_number, received_items } = body as {
      action: 'receive' | 'cancel' | 'set_status' | 'update_invoice'
      status?: string
      supplier_invoice_number?: string
      received_items?: Array<{ item_id: string; received_quantity: number }>
    }

    const admin = createAdminClient() as any

    // Fetch current PO
    const { data: poRaw } = await admin
      .from('purchase_orders')
      .select('id, po_number, status, total_amount, organization_id')
      .eq('id', poId)
      .single()
    const po = poRaw as { id: string; po_number: string; status: string; total_amount: number; organization_id: string } | null
    if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 })

    if (po.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (action === 'cancel') {
      await admin.from('purchase_orders').update({ status: 'cancelled' }).eq('id', poId)
      await logAudit({ orgId: profile.organization_id, userId: user.id, userName: profile.full_name,
        action: 'status_change', entityType: 'purchase_order', entityId: poId, entityLabel: po.po_number,
        changes: { status: { before: po.status, after: 'cancelled' } } })
      return NextResponse.json({ success: true })
    }

    if (action === 'set_status' && status) {
      await admin.from('purchase_orders').update({ status }).eq('id', poId)
      await logAudit({ orgId: profile.organization_id, userId: user.id, userName: profile.full_name,
        action: 'status_change', entityType: 'purchase_order', entityId: poId, entityLabel: po.po_number,
        changes: { status: { before: po.status, after: status } } })
      return NextResponse.json({ success: true })
    }

    if (action === 'update_invoice' && supplier_invoice_number !== undefined) {
      await admin.from('purchase_orders').update({ supplier_invoice_number }).eq('id', poId)
      return NextResponse.json({ success: true })
    }

    if (action === 'receive' && received_items) {
      // Fetch current state of all line items so we can compute deltas
      const { data: currentItemsRaw } = await admin
        .from('purchase_order_items')
        .select('id, description, category, item_id, quantity, quantity_received, unit_cost')
        .eq('purchase_order_id', poId)

      type POItemRow = {
        id: string; description: string; category: string | null; item_id: string | null
        quantity: number; quantity_received: number; unit_cost: number
      }
      const currentItems = (currentItemsRaw ?? []) as POItemRow[]

      for (const ri of received_items) {
        const newQty = Number(ri.received_quantity)
        if (newQty <= 0) continue

        const existing = currentItems.find((i) => i.id === ri.item_id)
        if (!existing) continue

        const prevQty = Number(existing.quantity_received ?? 0)
        const delta = newQty - prevQty
        if (delta <= 0) continue // no new goods received

        // Update quantity_received on the PO line item
        await admin
          .from('purchase_order_items')
          .update({ quantity_received: newQty })
          .eq('id', ri.item_id)

        // Resolve inventory item — use linked item_id, or find/create by description
        let invItemId: string | null = existing.item_id

        if (!invItemId) {
          // Try to find an existing inventory item with matching name in this org
          const { data: matchRaw } = await admin
            .from('inventory_items')
            .select('id, current_stock')
            .eq('organization_id', profile.organization_id)
            .ilike('item_name', existing.description.trim())
            .limit(1)
            .maybeSingle()

          if (matchRaw) {
            invItemId = matchRaw.id
          } else {
            // Create a new inventory item for this description
            const { data: newItem } = await admin
              .from('inventory_items')
              .insert({
                organization_id: profile.organization_id,
                item_code: `AUTO-${Date.now()}`,
                item_name: existing.description.trim(),
                category: existing.category || null,
                current_stock: 0,
                purchase_price: existing.unit_cost,
                created_by: user.id,
              })
              .select('id')
              .single()
            invItemId = newItem?.id ?? null
          }

          // Link the inventory item back to the PO line item
          if (invItemId) {
            await admin
              .from('purchase_order_items')
              .update({ item_id: invItemId })
              .eq('id', ri.item_id)
          }
        }

        if (!invItemId) continue

        // Fetch current stock
        const { data: invRaw } = await admin
          .from('inventory_items')
          .select('current_stock')
          .eq('id', invItemId)
          .single()
        const stockBefore = Number((invRaw as { current_stock: number } | null)?.current_stock ?? 0)
        const stockAfter = stockBefore + delta

        // Update current_stock
        await admin
          .from('inventory_items')
          .update({ current_stock: stockAfter, updated_at: new Date().toISOString() })
          .eq('id', invItemId)

        // Record inventory transaction
        await admin.from('inventory_transactions').insert({
          organization_id: profile.organization_id,
          item_id: invItemId,
          transaction_type: 'purchase',
          quantity: delta,
          unit_cost: existing.unit_cost,
          total_cost: delta * existing.unit_cost,
          stock_before: stockBefore,
          stock_after: stockAfter,
          reference_type: 'purchase_order',
          reference_id: poId,
          created_by: user.id,
        })
      }

      // Check if all items are fully received
      const { data: allItemsRaw } = await admin
        .from('purchase_order_items')
        .select('quantity, quantity_received')
        .eq('purchase_order_id', poId)

      const allItems = (allItemsRaw ?? []) as { quantity: number; quantity_received: number }[]
      const allReceived = allItems.every((i) => (i.quantity_received ?? 0) >= i.quantity)
      const anyReceived = allItems.some((i) => (i.quantity_received ?? 0) > 0)

      const newStatus = allReceived ? 'received' : anyReceived ? 'partial' : po.status
      await admin.from('purchase_orders').update({ status: newStatus }).eq('id', poId)

      await logAudit({ orgId: profile.organization_id, userId: user.id, userName: profile.full_name,
        action: 'status_change', entityType: 'purchase_order', entityId: poId, entityLabel: po.po_number,
        changes: { status: { before: po.status, after: newStatus } } })

      return NextResponse.json({ success: true, status: newStatus })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
