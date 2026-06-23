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
      supplier_id,
      purchase_date,
      notes,
      items,
    } = body

    if (!supplier_id) return NextResponse.json({ error: 'Supplier is required' }, { status: 400 })
    if (!purchase_date) return NextResponse.json({ error: 'Purchase date is required' }, { status: 400 })
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: seqData } = await (supabase as any).rpc('generate_sequence_number', {
      p_org_id: profile.organization_id,
      p_type: 'purchase_order',
      p_prefix: 'PO',
    })
    const poNumber = seqData ?? `PO-${Date.now()}`

    const totalAmount = items.reduce(
      (sum: number, item: { quantity: number; unit_price: number }) =>
        sum + Number(item.quantity) * Number(item.unit_price ?? item.unit_price),
      0,
    )

    const { data: po, error: poError } = await (supabase as any)
      .from('purchase_orders')
      .insert({
        organization_id: profile.organization_id,
        po_number: poNumber,
        supplier_id,
        purchase_date,
        status: 'draft',
        total_amount: totalAmount,
        amount_paid: 0,
        balance_due: totalAmount,
        payment_status: 'unpaid',
        notes: notes?.trim() || null,
        created_by: user.id,
      })
      .select('id, po_number')
      .single()

    if (poError) throw poError

    const lineItems = items.map((item: { description: string; category?: string; quantity: number; unit_price: number }) => ({
      organization_id: profile.organization_id,
      purchase_order_id: po.id,
      description: item.description,
      category: item.category || null,
      quantity: Number(item.quantity),
      unit_cost: Number(item.unit_price),
      total_cost: Number(item.quantity) * Number(item.unit_price),
    }))

    const { error: itemsError } = await (supabase as any)
      .from('purchase_order_items')
      .insert(lineItems)

    if (itemsError) throw itemsError

    return NextResponse.json({ id: po.id, po_number: po.po_number })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Create PO error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
