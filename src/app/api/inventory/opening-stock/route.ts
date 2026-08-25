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

    // Set current_stock and record the ledger entry atomically, in one call
    // (set_inventory_stock_logged, migration 034) — the previous two-step
    // version (RPC, then a separate insert) also referenced a
    // transaction_date column that inventory_transactions has never had, so
    // every non-zero opening-stock update was silently failing to write a
    // ledger row at all (the insert's error was never even checked).
    const { error: updateError } = await admin
      .rpc('set_inventory_stock_logged', {
        p_item_id: item.id,
        p_new_stock: qty,
        p_org_id: profile.organization_id,
        p_transaction_type: 'adjustment',
        p_unit_cost: 0,
        p_reference_type: 'opening_stock',
        p_reference_id: null,
        p_notes: date ? `Opening stock balance as of ${date}` : 'Opening stock balance',
        p_created_by: user.id,
      })
      .single()

    if (updateError) { errors.push(`Item ${item.id}: ${updateError.message}`); continue }
  }

  if (errors.length) return NextResponse.json({ error: errors.join('; ') }, { status: 500 })
  return NextResponse.json({ success: true, updated: items.length })
}
