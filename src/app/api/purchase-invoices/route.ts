/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users').select('organization_id').eq('id', user.id).single()
    const orgId = (profileRaw as any)?.organization_id
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    if (items.some(it => !it.inventory_item_id && !it.description?.trim())) return NextResponse.json({ error: 'Non-inventory items must have a description' }, { status: 400 })
    if (items.some(it => !it.quantity || it.quantity <= 0)) return NextResponse.json({ error: 'All quantities must be greater than 0' }, { status: 400 })

    const supabase = createAdminClient() as any

    // Generate invoice number
    const { data: seqData } = await supabase.rpc('generate_sequence_number', {
      p_org_id: orgId,
      p_type: 'purchase_invoice',
      p_prefix: 'PINV',
    })
    const invoiceNumber = seqData ?? `PINV-${Date.now()}`

    // Calculate totals
    const subtotal = items.reduce((s, it) => s + it.quantity * it.unit_cost, 0)
    const discountAmt = Number(discount_amount ?? 0)
    const totalAmount = Math.max(0, subtotal - discountAmt)
    const amountPaid = payment_type === 'cash' ? totalAmount : 0
    const balanceDue = payment_type === 'cash' ? 0 : totalAmount

    // Insert purchase invoice
    const { data: invoice, error: invErr } = await supabase
      .from('purchase_invoices')
      .insert({
        organization_id: orgId,
        invoice_number: invoiceNumber,
        supplier_id: supplier_id || null,
        supplier_name: supplier_name?.trim() || null,
        supplier_invoice_number: supplier_invoice_number?.trim() || null,
        invoice_date,
        due_date: due_date || null,
        payment_type,
        payment_mode: payment_type === 'cash' ? (payment_mode || 'cash') : null,
        subtotal,
        discount_amount: discountAmt,
        total_amount: totalAmount,
        amount_paid: amountPaid,
        balance_due: balanceDue,
        payment_status: payment_type === 'cash' ? 'paid' : 'unpaid',
        notes: notes?.trim() || null,
        status: 'confirmed',
        created_by: user.id,
      })
      .select('id, invoice_number')
      .single()

    if (invErr) throw invErr

    // Insert line items + update inventory
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const qty = Number(it.quantity)
      const unitCost = Number(it.unit_cost)
      const totalCost = qty * unitCost

      // Insert line item
      const { error: liErr } = await supabase.from('purchase_invoice_items').insert({
        organization_id: orgId,
        purchase_invoice_id: invoice.id,
        inventory_item_id: it.inventory_item_id || null,
        description: it.description,
        unit_of_measure: it.unit_of_measure?.trim() || null,
        quantity: qty,
        unit_cost: unitCost,
        total_cost: totalCost,
        sort_order: i,
      })
      if (liErr) throw liErr

      // Non-inventory items skip stock updates entirely
      if (!it.inventory_item_id) continue

      // Get current stock for transaction record
      const { data: invItem } = await supabase
        .from('inventory_items')
        .select('current_stock, purchase_price')
        .eq('id', it.inventory_item_id)
        .single()

      const stockBefore = invItem?.current_stock ?? 0
      const stockAfter = stockBefore + qty

      // Update current_stock
      const { error: stockErr } = await supabase
        .from('inventory_items')
        .update({
          current_stock: stockAfter,
          purchase_price: unitCost > 0 ? unitCost : (invItem?.purchase_price ?? 0),
          updated_at: new Date().toISOString(),
        })
        .eq('id', it.inventory_item_id)
      if (stockErr) throw stockErr

      // Record inventory transaction
      await supabase.from('inventory_transactions').insert({
        organization_id: orgId,
        item_id: it.inventory_item_id,
        transaction_type: 'purchase',
        quantity: qty,
        unit_cost: unitCost,
        total_cost: totalCost,
        stock_before: stockBefore,
        stock_after: stockAfter,
        reference_type: 'purchase_invoice',
        reference_id: invoice.id,
        notes: `Purchase Invoice ${invoiceNumber}`,
        created_by: user.id,
      })
    }

    // Record supplier payment for cash purchases (if supplier is linked)
    if (payment_type === 'cash' && supplier_id) {
      await supabase.from('supplier_payments').insert({
        organization_id: orgId,
        supplier_id,
        payment_date: invoice_date,
        amount_paid: totalAmount,
        payment_mode: payment_mode || 'cash',
        notes: `Purchase Invoice ${invoiceNumber}`,
        paid_by: user.id,
      })
    }

    return NextResponse.json({ success: true, id: invoice.id, invoiceNumber: invoice.invoice_number })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Create purchase invoice error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
