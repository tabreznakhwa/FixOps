import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

type UntypedSupabaseClient = {
  from(table: string): {
    select(columns?: string): UntypedQueryBuilder
    insert(values: Record<string, unknown> | Record<string, unknown>[]): UntypedQueryBuilder
    update(values: Record<string, unknown>): UntypedQueryBuilder
  }
  rpc(
    name: 'generate_sequence_number',
    args: { p_org_id: string; p_type: string; p_prefix: string },
  ): Promise<{ data: string | null; error: unknown }>
}

type UntypedQueryBuilder = PromiseLike<{ data: unknown; error: unknown }> & {
  select(columns?: string): UntypedQueryBuilder
  eq(column: string, value: unknown): UntypedQueryBuilder
  order(column: string, options?: { ascending?: boolean }): UntypedQueryBuilder
  single(): Promise<{ data: unknown; error: unknown }>
}

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
    return { error: NextResponse.json({ error: 'Only admin and owner can convert quotations' }, { status: 403 }) }
  }

  return { user, profile: { organization_id: profile.organization_id, role: profile.role } }
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await getAdminProfile()
    if (auth.error) return auth.error

    const admin = createAdminClient() as unknown as UntypedSupabaseClient
    const { data: quotationRaw, error: qErr } = await admin
      .from('quotations')
      .select('*')
      .eq('id', id)
      .eq('organization_id', auth.profile.organization_id)
      .single()

    if (qErr || !quotationRaw) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })

    const quotation = quotationRaw as unknown as {
      id: string
      quotation_number: string
      customer_id: string
      work_order_id: string | null
      status: string
      subtotal: number
      discount_amount: number
      tax_amount: number
      total_amount: number
      notes: string | null
      terms_and_conditions: string | null
    }

    if (quotation.status === 'converted') return NextResponse.json({ error: 'Quotation already converted' }, { status: 400 })
    if (['rejected', 'expired'].includes(quotation.status)) return NextResponse.json({ error: 'Rejected or expired quotation cannot be converted' }, { status: 400 })

    const { data: quotationItemsRaw, error: itemsErr } = await admin
      .from('quotation_items')
      .select('*')
      .eq('quotation_id', id)
      .eq('organization_id', auth.profile.organization_id)
      .order('sort_order')

    if (itemsErr) throw itemsErr

    const quotationItems = (quotationItemsRaw ?? []) as Array<{
      id: string
      description: string
      quantity: number
      unit_price: number
      total_price: number
    }>

    if (!quotationItems.length) return NextResponse.json({ error: 'Quotation has no items' }, { status: 400 })

    const { data: seqData } = await admin.rpc('generate_sequence_number', {
      p_org_id: auth.profile.organization_id,
      p_type: 'invoice',
      p_prefix: 'INV',
    })
    const invoiceNumber = seqData ?? `INV${Date.now()}`
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })

    const { data: invoiceRaw, error: invErr } = await admin
      .from('invoices')
      .insert({
        organization_id: auth.profile.organization_id,
        invoice_number: invoiceNumber,
        customer_id: quotation.customer_id,
        work_order_id: quotation.work_order_id,
        quotation_id: quotation.id,
        invoice_date: today,
        due_date: null,
        invoice_type: 'service',
        subtotal: quotation.subtotal,
        discount_amount: quotation.discount_amount,
        tax_rate: 0,
        tax_amount: quotation.tax_amount,
        total_amount: quotation.total_amount,
        amount_paid: 0,
        balance_due: quotation.total_amount,
        status: 'draft',
        notes: quotation.notes,
        terms_and_conditions: quotation.terms_and_conditions,
        created_by: auth.user.id,
      })
      .select('id, invoice_number')
      .single()

    if (invErr || !invoiceRaw) throw invErr ?? new Error('Failed to create invoice')

    const invoice = invoiceRaw as { id: string; invoice_number: string }

    const invoiceItems = quotationItems.map((item, index) => ({
      organization_id: auth.profile.organization_id,
      invoice_id: invoice.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
      reference_type: 'quotation_item',
      reference_id: item.id,
      sort_order: index,
    }))

    const { error: lineErr } = await admin.from('invoice_items').insert(invoiceItems)
    if (lineErr) throw lineErr

    await admin.from('quotations').update({ status: 'converted', updated_at: new Date().toISOString() }).eq('id', id)

    await logAudit({
      orgId: auth.profile.organization_id,
      userId: auth.user.id,
      action: 'convert',
      entityType: 'quotation',
      entityId: id,
      entityLabel: `${quotation.quotation_number} → ${invoice.invoice_number}`,
    })

    return NextResponse.json({ success: true, invoice_id: invoice.id, invoice_number: invoice.invoice_number })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to convert quotation'
    console.error('Convert quotation error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
