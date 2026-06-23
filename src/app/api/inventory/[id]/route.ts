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

    const supabase = createAdminClient()

    const { data: updated, error } = await (supabase as any)
      .from('inventory_items')
      .update({ ...updatePayload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, item_code, item_name, current_stock, is_active')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, item: updated })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Update inventory item error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
