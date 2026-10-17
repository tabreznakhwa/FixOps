/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { parseSupplierPaymentInput } from '@/lib/supplierPayments'

function rpcStatus(message: string) {
  if (/not found|does not belong/i.test(message)) return 404
  if (/already|exceeds|requires|cannot|cancelled|no accounting posting/i.test(message)) return 409
  return 400
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabase as any)
      .from('users')
      .select('organization_id, full_name, role')
      .eq('id', user.id)
      .single()
    const profile = profileRaw as { organization_id: string; full_name: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    const admin = createAdminClient() as any
    const { data: result, error } = await admin.rpc('record_supplier_payment', {
      p_org_id: profile.organization_id,
      p_actor_id: user.id,
      p_supplier_id: input.supplierId,
      p_purchase_invoice_id: input.purchaseInvoiceId,
      p_payment_date: input.paymentDate,
      p_amount_paid: input.amountPaid,
      p_discount_amount: input.discountAmount,
      p_payment_mode: input.paymentMode,
      p_reference_number: input.referenceNumber,
      p_notes: input.notes,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: rpcStatus(error.message) })
    }

    const rows = Array.isArray(result) ? result : result ? [result] : []
    const paymentId = rows[0]?.supplier_payment_id as string | undefined
    const postingId = rows[0]?.posting_id as string | undefined
    if (!paymentId || !postingId) {
      return NextResponse.json({ error: 'Supplier payment could not be recorded' }, { status: 500 })
    }

    await logAudit({
      orgId: profile.organization_id,
      userId: user.id,
      userName: profile.full_name,
      action: 'create',
      entityType: 'vendor_payment',
      entityId: paymentId,
      entityLabel: `Payment of ${input.amountPaid}${input.discountAmount > 0 ? ` (+ ${input.discountAmount} discount)` : ''} to supplier${input.purchaseInvoiceId ? ' against purchase invoice' : ''}`,
    })

    return NextResponse.json({ success: true, id: paymentId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to record supplier payment'
    console.error('Create supplier payment error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
