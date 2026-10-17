/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/

function rpcErrorStatus(message: string): number {
  if (/not found|does not belong/i.test(message)) return 404
  if (/already|cancelled|settled|duplicate|unapply|reconcile|match|no balance/i.test(message)) return 409
  return 400
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid supplier advance' }, { status: 400 })
    }

    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile || !['admin', 'owner', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const input = body as Record<string, unknown>
    if (typeof input.action !== 'string') {
      return NextResponse.json({ error: 'No action specified' }, { status: 400 })
    }

    const admin = createAdminClient() as any

    if (input.action === 'apply' || input.action === 'unapply') {
      const purchaseInvoiceId = input.purchase_invoice_id
      if (typeof purchaseInvoiceId !== 'string' || !UUID_RE.test(purchaseInvoiceId)) {
        return NextResponse.json({ error: 'A valid purchase invoice is required' }, { status: 400 })
      }

      const rpc = input.action === 'apply'
        ? 'apply_supplier_advance'
        : 'unapply_supplier_advance'
      const { data: result, error } = await admin.rpc(rpc, {
        p_org_id: profile.organization_id,
        p_actor_id: user.id,
        p_supplier_advance_id: id,
        p_purchase_invoice_id: purchaseInvoiceId,
      })
      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: rpcErrorStatus(error.message) },
        )
      }

      const rows = Array.isArray(result) ? result : result ? [result] : []
      const row = rows[0]
      if (!row) {
        return NextResponse.json({ error: `Supplier advance was not ${input.action === 'apply' ? 'applied' : 'unapplied'}` }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        ...(input.action === 'apply'
          ? { applied_amount: row.applied_amount }
          : { unapplied_amount: row.unapplied_amount }),
        balance_due: row.balance_due,
      })
    }

    if (input.action === 'cancel') {
      const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
      if (!reason) {
        return NextResponse.json({ error: 'Cancellation reason is required' }, { status: 400 })
      }
      if (reason.length > 1000) {
        return NextResponse.json({ error: 'Cancellation reason is too long' }, { status: 400 })
      }

      const { data: result, error } = await admin.rpc('cancel_supplier_advance', {
        p_org_id: profile.organization_id,
        p_actor_id: user.id,
        p_supplier_advance_id: id,
        p_reason: reason,
      })
      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: rpcErrorStatus(error.message) },
        )
      }

      const rows = Array.isArray(result) ? result : result ? [result] : []
      if (!rows[0]?.cancelled || !rows[0]?.posting_id) {
        return NextResponse.json({ error: 'Supplier advance was not cancelled' }, { status: 500 })
      }
      return NextResponse.json({ success: true, posting_id: rows[0].posting_id })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: unknown) {
    console.error('Supplier advance PATCH error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
