import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export async function POST(request: NextRequest) {
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await (supabaseUser as any)
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const {
      customer_id,
      invoice_type,
      invoice_date,
      due_date,
      work_order_id,
      ref_number,
      items,
      discount_amount,
      tax_rate,
      notes,
      terms_and_conditions,
    } = body

    if (!customer_id) return NextResponse.json({ error: 'Customer is required' }, { status: 400 })
    if (!invoice_type) return NextResponse.json({ error: 'Invoice type is required' }, { status: 400 })
    if (!invoice_date) return NextResponse.json({ error: 'Invoice date is required' }, { status: 400 })
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: seqData } = await (supabase as any).rpc('generate_sequence_number', {
      p_org_id: profile.organization_id,
      p_type: 'invoice',
      p_prefix: 'INV',
    })
    const invoiceNumber = seqData ?? `INV-${Date.now()}`

    // Calculate subtotal from items (qty * unit_price, before any discounts/taxes)
    const subtotal = items.reduce((sum: number, item: { quantity: number; unit_price: number }) => {
      return sum + item.quantity * item.unit_price
    }, 0)

    // Sum item-level discounts so invoice total reflects them
    const itemDiscountTotal = items.reduce((sum: number, item: { quantity: number; unit_price: number; discount_percent?: number }) => {
      return sum + item.quantity * item.unit_price * (Number(item.discount_percent ?? 0) / 100)
    }, 0)

    const headerDiscount = Number(discount_amount ?? 0)
    const totalDiscountAmount = itemDiscountTotal + headerDiscount
    const taxableAmount = subtotal - totalDiscountAmount
    const taxRateVal = Number(tax_rate ?? 0)
    const taxAmount = (taxableAmount * taxRateVal) / 100
    const totalAmount = taxableAmount + taxAmount

    const { data: invoice, error: invError } = await (supabase as any)
      .from('invoices')
      .insert({
        organization_id: profile.organization_id,
        invoice_number: invoiceNumber,
        customer_id,
        invoice_type,
        invoice_date,
        due_date: due_date ?? null,
        work_order_id: work_order_id ?? null,
        ref_number: ref_number?.trim() ?? null,
        subtotal,
        discount_amount: totalDiscountAmount,
        tax_rate: taxRateVal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        amount_paid: 0,
        balance_due: totalAmount,
        status: 'draft',
        notes: notes?.trim() ?? null,
        terms_and_conditions: terms_and_conditions?.trim() ?? null,
        created_by: user.id,
      })
      .select('id, invoice_number')
      .single()

    if (invError) throw invError

    // Insert line items
    const lineItemRows = items.map(
      (
        item: {
          description: string
          quantity: number
          unit_price: number
          discount_percent: number
          tax_percent: number
          inventory_item_id?: string | null
        },
        index: number,
      ) => {
        const qty = Number(item.quantity)
        const unitPrice = Number(item.unit_price)
        const discPct = Number(item.discount_percent ?? 0)
        const taxPct = Number(item.tax_percent ?? 0)
        const lineTotal = qty * unitPrice * (1 - discPct / 100) * (1 + taxPct / 100)
        return {
          organization_id: profile.organization_id,
          invoice_id: invoice.id,
          description: item.description,
          quantity: qty,
          unit_price: unitPrice,
          discount_percent: discPct,
          tax_percent: taxPct,
          line_total: lineTotal,
          total_price: lineTotal,
          sort_order: index,
        }
      },
    )

    const { error: itemsError } = await (supabase as any)
      .from('invoice_items')
      .insert(lineItemRows)

    if (itemsError) throw itemsError

    // Deduct stock for any inventory items used
    const inventoryLines = items.filter(
      (it: { inventory_item_id?: string | null }) => it.inventory_item_id,
    ) as { inventory_item_id: string; quantity: number }[]

    if (inventoryLines.length > 0) {
      await Promise.all(
        inventoryLines.map(async (it) => {
          const qty = Number(it.quantity) || 1
          await (supabase as any).rpc('decrement_stock', {
            p_item_id: it.inventory_item_id,
            p_qty: qty,
          })
        }),
      )
    }

    // Create ledger entry
    const { error: ledgerError } = await (supabase as any)
      .from('customer_ledger_entries')
      .insert({
        organization_id: profile.organization_id,
        customer_id,
        entry_date: invoice_date,
        entry_type: 'invoice',
        debit_amount: totalAmount,
        credit_amount: 0,
        description: `Invoice ${invoiceNumber}`,
        reference_type: 'invoice',
        reference_id: invoice.id,
        created_by: user.id,
      })

    if (ledgerError) throw ledgerError

    // If this invoice is for a work order, auto-apply any payment already collected
    // for it (e.g. via the work order's "Collect Payment" action) that isn't linked
    // to an invoice yet — the trg_invoice_balance trigger recalculates amount_paid/
    // balance_due/status on the invoice once invoice_id is set.
    if (work_order_id) {
      const { data: unlinkedPayments } = await (supabase as any)
        .from('payments')
        .select('id')
        .eq('work_order_id', work_order_id)
        .is('invoice_id', null)
        .eq('is_cancelled', false)

      if (unlinkedPayments && unlinkedPayments.length > 0) {
        await (supabase as any)
          .from('payments')
          .update({ invoice_id: invoice.id })
          .in('id', unlinkedPayments.map((p: { id: string }) => p.id))
      }
    }

    await logAudit({
      orgId: profile.organization_id,
      userId: user.id,
      action: 'create',
      entityType: 'invoice',
      entityId: invoice.id,
      entityLabel: `${invoice.invoice_number} — KWD ${totalAmount.toFixed(3)}`,
    })

    return NextResponse.json({ success: true, id: invoice.id, invoiceNumber: invoice.invoice_number })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Create invoice error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
