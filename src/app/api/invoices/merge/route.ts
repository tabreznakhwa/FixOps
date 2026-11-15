import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export async function POST(request: NextRequest) {
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await (supabaseUser as any)
      .from('users').select('organization_id, role, full_name').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['admin', 'owner'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { invoice_ids, invoice_date, due_date, notes, ref_number, discount_amount } = body

    if (!Array.isArray(invoice_ids) || invoice_ids.length < 2) {
      return NextResponse.json({ error: 'Select at least 2 invoices to merge' }, { status: 400 })
    }
    if (!invoice_date) {
      return NextResponse.json({ error: 'Invoice date is required' }, { status: 400 })
    }
    const discount = Number(discount_amount ?? 0)
    if (!Number.isFinite(discount) || discount < 0) {
      return NextResponse.json({ error: 'Discount must be a non-negative number' }, { status: 400 })
    }

    const admin = createAdminClient() as any
    const { data: mergedRows, error: mergeError } = await admin.rpc(
      'merge_issued_customer_invoices',
      {
        p_org_id: profile.organization_id,
        p_actor_id: user.id,
        p_invoice_ids: invoice_ids,
        p_invoice_date: invoice_date,
        p_due_date: due_date ?? null,
        p_notes: notes?.trim() || null,
        p_ref_number: ref_number?.trim() || null,
        p_discount_amount: discount,
      },
    )
    if (mergeError) throw mergeError

    const newInvoice = Array.isArray(mergedRows) ? mergedRows[0] : mergedRows
    if (!newInvoice?.invoice_id || !newInvoice?.invoice_number) {
      throw new Error('Failed to create consolidated invoice')
    }

    await logAudit({
      orgId: profile.organization_id,
      userId: user.id,
      userName: profile.full_name,
      action: 'create',
      entityType: 'invoice',
      entityId: newInvoice.invoice_id,
      entityLabel: `${newInvoice.invoice_number} (merged from ${invoice_ids.length} issued invoices)`,
    })

    return NextResponse.json({
      id: newInvoice.invoice_id,
      invoice_number: newInvoice.invoice_number,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Merge invoices error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
