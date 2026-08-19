import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profileRaw } = await (supabase as any)
    .from('users').select('organization_id, role').eq('id', user.id).single()
  const profile = profileRaw as { organization_id: string; role: string } | null
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { items, date } = await request.json() as {
    items: Array<{ id: string; qty: number }>
    date: string
  }
  if (!items?.length) return NextResponse.json({ error: 'No items provided' }, { status: 400 })

  const admin = createAdminClient() as any
  const errors: string[] = []

  for (const item of items) {
    const qty = Number(item.qty) || 0

    // Confirm the item belongs to this org before touching it — the admin
    // client bypasses RLS, so this check is the org boundary.
    const { data: existing } = await admin
      .from('inventory_items')
      .select('id')
      .eq('id', item.id)
      .eq('organization_id', profile.organization_id)
      .single()
    if (!existing) { errors.push(`Item ${item.id}: not found`); continue }

    // Set current_stock atomically (migration 032) instead of a plain UPDATE,
    // which could race with any other stock change happening at the same time.
    const { data: rpcData, error: updateError } = await admin
      .rpc('set_inventory_stock', { p_item_id: item.id, p_new_stock: qty })
      .single()

    if (updateError) { errors.push(`Item ${item.id}: ${updateError.message}`); continue }

    const stockBefore = Number(rpcData.stock_before)
    const stockAfter = Number(rpcData.stock_after)
    const delta = stockAfter - stockBefore
    if (delta === 0) continue

    // Record as opening stock transaction. quantity is the signed CHANGE, not
    // the new absolute value — logging the absolute value here previously
    // overstated "received" for every item ever touched by this page, which
    // corrupted any reconciliation built on top of the ledger.
    await admin.from('inventory_transactions').insert({
      organization_id: profile.organization_id,
      item_id: item.id,
      transaction_type: 'adjustment',
      quantity: delta,
      stock_before: stockBefore,
      stock_after: stockAfter,
      transaction_date: date,
      notes: 'Opening stock balance',
      created_by: user.id,
    })
  }

  if (errors.length) return NextResponse.json({ error: errors.join('; ') }, { status: 500 })
  return NextResponse.json({ success: true, updated: items.length })
}
