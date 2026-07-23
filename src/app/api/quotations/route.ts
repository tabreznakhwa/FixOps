import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import type { UntypedSupabaseClient } from '@/lib/supabase/untyped'

type QuotationItemInput = { description: string; quantity: number; unit_price: number }

async function getAdminProfile() {
  const supabaseUser = await createClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profileRaw } = await supabaseUser
    .from('users')
    .select('organization_id, role')
    .eq('id', user.id)
    .single()
  const profile = profileRaw as unknown as { organization_id: string | null; role: string } | null

  if (!profile?.organization_id || !['owner', 'admin'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Only admin and owner can access quotations' }, { status: 403 }) }
  }

  return { user, profile: { organization_id: profile.organization_id, role: profile.role } }
}

async function validateCustomerAndWorkOrder(
  admin: UntypedSupabaseClient,
  organizationId: string,
  customerId: string,
  workOrderId?: string | null,
) {
  const { data: customer } = await admin
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('organization_id', organizationId)
    .single()

  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 400 })

  if (workOrderId) {
    const { data: workOrder } = await admin
      .from('work_orders')
      .select('id')
      .eq('id', workOrderId)
      .eq('customer_id', customerId)
      .eq('organization_id', organizationId)
      .single()

    if (!workOrder) return NextResponse.json({ error: 'Work order not found for this customer' }, { status: 400 })
  }

  return null
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAdminProfile()
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customer_id')
    const status = searchParams.get('status')

    const admin = createAdminClient() as unknown as UntypedSupabaseClient
    let query = admin
      .from('quotations')
      .select('id, quotation_number, quotation_date, valid_until, status, total_amount, customer_id, customers(full_name, mobile_number)')
      .eq('organization_id', auth.profile.organization_id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (customerId) query = query.eq('customer_id', customerId)
    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ quotations: data ?? [] })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch quotations'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAdminProfile()
    if (auth.error) return auth.error

    const body = await request.json()
    const {
      customer_id,
      work_order_id,
      quotation_date,
      valid_until,
      discount_amount,
      notes,
      terms_and_conditions,
      items,
    } = body

    if (!customer_id) return NextResponse.json({ error: 'Customer is required' }, { status: 400 })
    if (!quotation_date) return NextResponse.json({ error: 'Quotation date is required' }, { status: 400 })
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })

    const cleanItems = items.map((item: QuotationItemInput) => ({
      description: String(item.description ?? '').trim(),
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || 0,
    }))
    if (cleanItems.some((item: QuotationItemInput) => !item.description)) {
      return NextResponse.json({ error: 'All line items need a description' }, { status: 400 })
    }

    const subtotal = cleanItems.reduce((sum: number, item: QuotationItemInput) => sum + item.quantity * item.unit_price, 0)
    const discount = Math.max(0, Number(discount_amount ?? 0))
    const total = Math.max(0, subtotal - discount)

    const admin = createAdminClient() as unknown as UntypedSupabaseClient
    const validationError = await validateCustomerAndWorkOrder(admin, auth.profile.organization_id, customer_id, work_order_id)
    if (validationError) return validationError

    const { data: seqData } = await admin.rpc('generate_sequence_number', {
      p_org_id: auth.profile.organization_id,
      p_type: 'quotation',
      p_prefix: 'QTN',
    })
    const quotationNumber = typeof seqData === 'string' ? seqData : `QTN${Date.now()}`

    const { data: quotationRaw, error: qErr } = await admin
      .from('quotations')
      .insert({
        organization_id: auth.profile.organization_id,
        quotation_number: quotationNumber,
        customer_id,
        work_order_id: work_order_id || null,
        quotation_date,
        valid_until: valid_until || null,
        status: 'draft',
        subtotal,
        discount_amount: discount,
        tax_amount: 0,
        total_amount: total,
        notes: notes?.trim() || null,
        terms_and_conditions: terms_and_conditions?.trim() || null,
        created_by: auth.user.id,
      })
      .select('id, quotation_number')
      .single()

    if (qErr || !quotationRaw) throw qErr ?? new Error('Failed to create quotation')

    const quotation = quotationRaw as { id: string; quotation_number: string }

    const rows = cleanItems.map((item: QuotationItemInput, index: number) => ({
      organization_id: auth.profile.organization_id,
      quotation_id: quotation.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.quantity * item.unit_price,
      sort_order: index,
    }))

    const { error: itemErr } = await admin.from('quotation_items').insert(rows)
    if (itemErr) throw itemErr

    await logAudit({
      orgId: auth.profile.organization_id,
      userId: auth.user.id,
      action: 'create',
      entityType: 'quotation',
      entityId: quotation.id,
      entityLabel: `${quotation.quotation_number} — KWD ${total.toFixed(3)}`,
    })

    return NextResponse.json({ success: true, id: quotation.id, quotationNumber: quotation.quotation_number })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create quotation'
    console.error('Create quotation error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
