import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export async function POST(request: NextRequest) {
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await (supabaseUser as any)
      .from('users').select('organization_id, role').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['admin', 'owner', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { invoice_ids, invoice_date, due_date, notes, ref_number } = body

    if (!Array.isArray(invoice_ids) || invoice_ids.length < 2) {
      return NextResponse.json({ error: 'Select at least 2 invoices to merge' }, { status: 400 })
    }
    if (!invoice_date) {
      return NextResponse.json({ error: 'Invoice date is required' }, { status: 400 })
    }

    const admin = createAdminClient() as any

    // Fetch all source invoices — verify they belong to same org + customer and are not paid/cancelled
    const { data: sourceInvoices } = await admin
      .from('invoices')
      .select('id, invoice_number, customer_id, status, amount_paid, total_amount, organization_id')
      .in('id', invoice_ids)

    if (!sourceInvoices || sourceInvoices.length !== invoice_ids.length) {
      return NextResponse.json({ error: 'One or more invoices not found' }, { status: 404 })
    }

    // Verify org ownership
    const wrongOrg = sourceInvoices.find((inv: { organization_id: string }) => inv.organization_id !== profile.organization_id)
    if (wrongOrg) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Verify same customer
    const customerIds = [...new Set(sourceInvoices.map((inv: { customer_id: string }) => inv.customer_id))]
    if (customerIds.length > 1) {
      return NextResponse.json({ error: 'All selected invoices must be from the same customer' }, { status: 400 })
    }
    const customerId = customerIds[0]

    // Verify none are paid or cancelled
    const blocked = sourceInvoices.find((inv: { status: string }) => ['paid', 'cancelled'].includes(inv.status))
    if (blocked) {
      return NextResponse.json({ error: `Invoice ${(blocked as { invoice_number: string }).invoice_number} is ${(blocked as { status: string }).status} and cannot be merged` }, { status: 400 })
    }

    // Fetch all line items from source invoices
    const { data: allItems, error: itemsErr } = await admin
      .from('invoice_items')
      .select('*')
      .in('invoice_id', invoice_ids)
      .order('sort_order')

    if (itemsErr) throw itemsErr
    if (!allItems || allItems.length === 0) {
      return NextResponse.json({ error: 'Source invoices have no line items' }, { status: 400 })
    }

    // Calculate merged totals
    const subtotal = allItems.reduce((s: number, it: { line_total: number }) => s + Number(it.line_total), 0)
    const totalAmount = subtotal

    // Generate invoice number
    const { data: seqData } = await admin.rpc('generate_sequence_number', {
      p_org_id: profile.organization_id,
      p_type: 'invoice',
      p_prefix: 'INV',
    })
    const invoiceNumber = seqData ?? `INV-${Date.now()}`

    // Create merged invoice
    const { data: newInvoice, error: invErr } = await admin
      .from('invoices')
      .insert({
        organization_id: profile.organization_id,
        customer_id: customerId,
        invoice_number: invoiceNumber,
        invoice_type: 'service',
        invoice_date,
        due_date: due_date ?? null,
        ref_number: ref_number?.trim() ?? null,
        subtotal,
        discount_amount: 0,
        tax_rate: 0,
        tax_amount: 0,
        total_amount: totalAmount,
        amount_paid: 0,
        balance_due: totalAmount,
        status: 'draft',
        notes: notes?.trim() ?? null,
        created_by: user.id,
      })
      .select('id, invoice_number')
      .single()

    if (invErr || !newInvoice) throw invErr ?? new Error('Failed to create merged invoice')

    // Insert merged line items (re-index sort_order)
    const lineItemRows = (allItems as Record<string, unknown>[]).map((it, idx) => ({
      organization_id: profile.organization_id,
      invoice_id: newInvoice.id,
      description: it.description,
      quantity: it.quantity,
      unit_price: it.unit_price,
      discount_percent: it.discount_percent ?? 0,
      tax_percent: it.tax_percent ?? 0,
      line_total: it.line_total,
      total_price: it.total_price ?? it.line_total,
      sort_order: idx,
      inventory_item_id: (it.inventory_item_id as string | null) ?? null,
    }))

    const { error: insertItemsErr } = await admin.from('invoice_items').insert(lineItemRows)
    if (insertItemsErr) throw insertItemsErr

    // Cancel all source invoices with reference to the new merged invoice
    const cancelReason = `Merged into ${invoiceNumber}`
    await admin.from('invoices').update({
      status: 'cancelled',
      cancelled_reason: cancelReason,
      updated_at: new Date().toISOString(),
    }).in('id', invoice_ids)

    await logAudit({
      orgId: profile.organization_id,
      userId: user.id,
      action: 'create',
      entityType: 'invoice',
      entityId: newInvoice.id,
      entityLabel: `${invoiceNumber} (merged from ${invoice_ids.length} invoices)`,
    })

    return NextResponse.json({ id: newInvoice.id, invoice_number: invoiceNumber })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Merge invoices error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
