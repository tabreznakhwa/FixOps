/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { parseSupplierPaymentInput } from '@/lib/supplierPayments'

function rpcStatus(message: string) {
  if (/authorized organization member|forbidden/i.test(message)) return 403
  if (/does not belong|not found/i.test(message)) return 404
  if (/changed|already settled|already paid|no longer open/i.test(message)) return 409
  return 400
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabase as any)
      .from('users')
      .select('organization_id, full_name, role, status')
      .eq('id', user.id)
      .single()
    const profile = profileRaw as {
      organization_id: string
      full_name: string
      role: string
      status: string
    } | null
    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!['owner', 'admin', 'manager', 'accounts'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 })
    }

    const parsed = parseSupplierPaymentInput(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const input = parsed.value
    const settlements = input.settlements.map((settlement, position) => ({
      position: position + 1,
      purchase_invoice_id: settlement.purchaseInvoiceId,
      expected_balance_due: settlement.expectedBalanceDue,
      amount_paid: settlement.amountPaid,
      discount_amount: settlement.discountAmount,
    }))

    const admin = createAdminClient() as any
    const { data: result, error } = await admin.rpc('record_supplier_payment_batch', {
      p_org_id: profile.organization_id,
      p_actor_id: user.id,
      p_supplier_id: input.supplierId,
      p_settlements: settlements,
      p_payment_date: input.paymentDate,
      p_payment_mode: input.paymentMode,
      p_reference_number: input.referenceNumber,
      p_notes: input.notes,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: rpcStatus(error.message) })
    }

    const rows = Array.isArray(result) ? result : result ? [result] : []
    const paymentIds = rows.map((row) => row.supplier_payment_id as string | undefined)
    const invoiceIds = rows.map((row) => row.purchase_invoice_id as string | undefined)
    const positionSet = new Set(rows.map((row) => Number(row.settlement_position)))
    if (
      rows.length !== input.settlements.length
      || paymentIds.some((id) => !id)
      || invoiceIds.some((id) => !id)
      || positionSet.size !== rows.length
      || input.settlements.some((settlement, index) => (
        invoiceIds[index] !== settlement.purchaseInvoiceId
        || Number(rows[index]?.settlement_position) !== index + 1
      ))
    ) {
      return NextResponse.json({ error: 'Supplier payments could not be recorded' }, { status: 500 })
    }

    const totalCash = input.settlements.reduce((sum, settlement) => sum + settlement.amountPaid, 0)
    const totalDiscount = input.settlements.reduce((sum, settlement) => sum + settlement.discountAmount, 0)
    await Promise.all(paymentIds.map((paymentId, index) => logAudit({
      orgId: profile.organization_id,
      userId: user.id,
      userName: profile.full_name,
      action: 'create',
      entityType: 'vendor_payment',
      entityId: paymentId,
      entityLabel: `Vendor payment against purchase invoice ${index + 1} of ${rows.length}`,
      changes: {
        supplier_id: input.supplierId,
        payment_id: paymentId,
        purchase_invoice_id: invoiceIds[index],
        batch_payment_ids: paymentIds,
        batch_purchase_invoice_ids: invoiceIds,
        batch_position: index + 1,
        batch_size: rows.length,
        payment_date: input.paymentDate,
        payment_mode: input.paymentMode,
        amount_paid: input.settlements[index].amountPaid,
        settlement_discount: input.settlements[index].discountAmount,
        total_settled: Math.round((
          input.settlements[index].amountPaid + input.settlements[index].discountAmount
        ) * 1000) / 1000,
        batch_cash_paid: Math.round(totalCash * 1000) / 1000,
        batch_settlement_discount: Math.round(totalDiscount * 1000) / 1000,
      },
    })))

    return NextResponse.json({
      success: true,
      id: paymentIds[0],
      ids: paymentIds,
    })
  } catch (error: unknown) {
    console.error('Create supplier payment error:', error)
    return NextResponse.json({ error: 'Unable to record supplier payment' }, { status: 500 })
  }
}
