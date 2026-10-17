/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users').select('organization_id, role').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile || !['owner', 'admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const {
      supplier_id,
      supplier_name,
      supplier_invoice_number,
      invoice_date,
      due_date,
      payment_type,
      payment_mode,
      discount_amount,
      notes,
      items,
    } = body as {
      supplier_id?: string
      supplier_name?: string
      supplier_invoice_number?: string
      invoice_date: string
      due_date?: string
      payment_type: 'cash' | 'credit'
      payment_mode?: string
      discount_amount?: number
      notes?: string
      items: { inventory_item_id: string | null; description: string; unit_of_measure?: string; quantity: number; unit_cost: number }[]
    }

    if (!invoice_date) return NextResponse.json({ error: 'Invoice date is required' }, { status: 400 })
    if (!payment_type) return NextResponse.json({ error: 'Payment type is required' }, { status: 400 })
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    if (items.some((item) => !item.inventory_item_id && !item.description?.trim())) {
      return NextResponse.json({ error: 'Non-inventory items must have a description' }, { status: 400 })
    }
    if (items.some((item) => !item.quantity || item.quantity <= 0)) {
      return NextResponse.json({ error: 'All quantities must be greater than 0' }, { status: 400 })
    }

    const admin = createAdminClient() as any
    const { data: result, error } = await admin.rpc('create_purchase_invoice', {
      p_org_id: profile.organization_id,
      p_actor_id: user.id,
      p_supplier_id: supplier_id || null,
      p_supplier_name: supplier_name?.trim() || null,
      p_supplier_invoice_number: supplier_invoice_number?.trim() || null,
      p_invoice_date: invoice_date,
      p_due_date: due_date || null,
      p_payment_type: payment_type,
      p_payment_mode: payment_mode || 'cash',
      p_discount_amount: Number(discount_amount ?? 0),
      p_notes: notes?.trim() || null,
      p_items: items.map((item, index) => ({
        inventory_item_id: item.inventory_item_id || null,
        description: item.description,
        unit_of_measure: item.unit_of_measure?.trim() || null,
        quantity: Number(item.quantity),
        unit_cost: Number(item.unit_cost),
        sort_order: index,
      })),
    })
    if (error) throw error

    const rows = Array.isArray(result) ? result : result ? [result] : []
    const invoice = rows[0] as { purchase_invoice_id?: string; invoice_number?: string } | undefined
    if (!invoice?.purchase_invoice_id) throw new Error('Purchase invoice was not created')

    return NextResponse.json({
      success: true,
      id: invoice.purchase_invoice_id,
      invoiceNumber: invoice.invoice_number,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Create purchase invoice error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
