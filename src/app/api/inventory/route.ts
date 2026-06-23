import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json()
    const {
      item_name,
      category,
      brand,
      unit_of_measure,
      current_stock,
      minimum_stock_level,
      purchase_price,
      selling_price,
      storage_location,
    } = body

    if (!item_name?.trim()) return NextResponse.json({ error: 'Item name is required' }, { status: 400 })

    const supabase = createAdminClient()

    const { data: seqData } = await (supabase as any).rpc('generate_sequence_number', {
      p_org_id: profile.organization_id,
      p_type: 'inventory',
      p_prefix: 'ITM',
    })
    const itemCode = seqData ?? `ITM-${Date.now()}`

    const { data: item, error } = await (supabase as any)
      .from('inventory_items')
      .insert({
        organization_id: profile.organization_id,
        item_code: itemCode,
        item_name: item_name.trim(),
        category: category?.trim() || null,
        brand: brand?.trim() || null,
        unit_of_measure: unit_of_measure ?? 'pcs',
        current_stock: Number(current_stock ?? 0),
        minimum_stock_level: Number(minimum_stock_level ?? 0),
        purchase_price: Number(purchase_price ?? 0),
        selling_price: Number(selling_price ?? 0),
        storage_location: storage_location?.trim() || null,
        is_active: true,
        created_by: user.id,
      })
      .select('id, item_code')
      .single()

    if (error) throw error

    return NextResponse.json({ id: item.id, item_code: item.item_code })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Create inventory item error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
