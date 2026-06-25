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

    // Update current_stock
    const { error: updateError } = await admin
      .from('inventory_items')
      .update({ current_stock: qty })
      .eq('id', item.id)
      .eq('organization_id', profile.organization_id)

    if (updateError) { errors.push(`Item ${item.id}: ${updateError.message}`); continue }

    // Record as opening stock transaction
    await admin.from('inventory_transactions').insert({
      organization_id: profile.organization_id,
      item_id: item.id,
      transaction_type: 'adjustment',
      quantity: qty,
      transaction_date: date,
      notes: 'Opening stock balance',
      created_by: user.id,
    })
  }

  if (errors.length) return NextResponse.json({ error: errors.join('; ') }, { status: 500 })
  return NextResponse.json({ success: true, updated: items.length })
}
