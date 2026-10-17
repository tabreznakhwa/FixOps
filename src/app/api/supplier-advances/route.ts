/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { isValidISODate, isValidMoney } from '@/lib/assets'
import { SUPPLIER_PAYMENT_MODES } from '@/lib/supplierPayments'

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/

function optionalText(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > 1000) return undefined
  return normalized
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users').select('organization_id, role').eq('id', user.id).single()
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

    if (typeof input.supplier_id !== 'string' || !UUID_RE.test(input.supplier_id)) {
      return NextResponse.json({ error: 'A valid supplier is required' }, { status: 400 })
    }
    if (typeof input.advance_date !== 'string' || !isValidISODate(input.advance_date)) {
      return NextResponse.json({ error: 'A valid advance date is required' }, { status: 400 })
    }
    if (!isValidMoney(input.amount) || Number(input.amount) <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than zero with up to three decimal places' }, { status: 400 })
    }
    if (
      typeof input.payment_mode !== 'string' ||
      !(SUPPLIER_PAYMENT_MODES as readonly string[]).includes(input.payment_mode)
    ) {
      return NextResponse.json({ error: 'Invalid payment mode' }, { status: 400 })
    }
    const referenceNumber = optionalText(input.reference_number)
    const notes = optionalText(input.notes)
    if (referenceNumber === undefined || notes === undefined) {
      return NextResponse.json({ error: 'Invalid reference or notes' }, { status: 400 })
    }

    const admin = createAdminClient() as any
    const { data: result, error } = await admin.rpc('record_supplier_advance', {
      p_org_id: profile.organization_id,
      p_actor_id: user.id,
      p_supplier_id: input.supplier_id,
      p_advance_date: input.advance_date,
      p_amount: Number(input.amount),
      p_payment_mode: input.payment_mode,
      p_reference_number: referenceNumber,
      p_notes: notes,
    })

    if (error) {
      const status = /not found|does not belong/i.test(error.message) ? 404 : /future|invalid|positive/i.test(error.message) ? 400 : 409
      return NextResponse.json({ error: error.message }, { status })
    }
    const rows = Array.isArray(result) ? result : result ? [result] : []
    const advance = rows[0] as { supplier_advance_id?: string; advance_number?: string; posting_id?: string } | undefined
    if (!advance?.supplier_advance_id || !advance.posting_id) {
      return NextResponse.json({ error: 'Supplier advance was not created' }, { status: 500 })
    }
    return NextResponse.json({ success: true, id: advance.supplier_advance_id, advance_number: advance.advance_number })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabase as any)
      .from('users').select('organization_id, role').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile || !['admin', 'owner', 'manager', 'accounts'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient() as any
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplier_id')
    if (supplierId && !UUID_RE.test(supplierId)) {
      return NextResponse.json({ error: 'Invalid supplier' }, { status: 400 })
    }

    let query = admin
      .from('supplier_advances')
      .select('*, suppliers(supplier_name)')
      .eq('organization_id', profile.organization_id)
      .eq('is_cancelled', false)
      .order('advance_date', { ascending: false })

    if (supplierId) query = query.eq('supplier_id', supplierId)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ advances: data ?? [] })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
