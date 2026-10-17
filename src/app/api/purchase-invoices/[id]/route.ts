/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

    let body: Record<string, unknown>
    try {
      const parsed: unknown = await request.json()
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
      }
      body = parsed as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 })
    }
    const admin = createAdminClient() as any

    if (body.action === 'cancel') {
      const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
      if (!reason) {
        return NextResponse.json({ error: 'Cancellation reason is required.' }, { status: 400 })
      }
      const { data: result, error } = await admin.rpc('cancel_purchase_invoice', {
        p_org_id: profile.organization_id,
        p_actor_id: user.id,
        p_purchase_invoice_id: id,
        p_reason: reason,
      })
      if (error) {
        const status = /not found/i.test(error.message)
          ? 404
          : /already|cannot|cancel or reallocate|no accounting posting/i.test(error.message)
            ? 409
            : 400
        return NextResponse.json({ error: error.message }, { status })
      }
      const rows = Array.isArray(result) ? result : result ? [result] : []
      return NextResponse.json({ success: true, reversedItems: rows[0]?.reversed_items ?? 0 })
    }

    if (body.action === 'update') {
      const { data: currentInvoice } = await admin
        .from('purchase_invoices')
        .select('posting_sequence')
        .eq('id', id)
        .eq('organization_id', profile.organization_id)
        .single()
      if (!currentInvoice) return NextResponse.json({ error: 'Purchase invoice not found' }, { status: 404 })

      const allowed = currentInvoice.posting_sequence
        ? ['due_date']
        : ['invoice_date', 'due_date', 'payment_type', 'payment_mode', 'payment_status', 'notes', 'supplier_id']
      const submitted = Object.keys(body).filter((key) => key !== 'action')
      const rejected = submitted.filter((key) => !allowed.includes(key))
      if (rejected.length > 0) {
        return NextResponse.json({ error: `Unsupported update field: ${rejected[0]}` }, { status: 400 })
      }
      if (submitted.length === 0) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const key of allowed) {
        if (key in body) updates[key] = body[key] === '' ? null : body[key]
      }
      const { error } = await admin
        .from('purchase_invoices')
        .update(updates)
        .eq('id', id)
        .eq('organization_id', profile.organization_id)
      if (error) throw error

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed'
    console.error('Purchase invoice PATCH error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
