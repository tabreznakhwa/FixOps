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

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await getAdminProfile()
    if (auth.error) return auth.error

    const admin = createAdminClient() as unknown as UntypedSupabaseClient
    const { data: quotation, error: qErr } = await admin
      .from('quotations')
      .select('*, customers(full_name, print_name, company_name, mobile_number, email, address, block, street, avenue, house_number, area, city), work_orders(work_order_number), users!quotations_created_by_fkey(full_name)')
      .eq('id', id)
      .eq('organization_id', auth.profile.organization_id)
      .single()

    if (qErr || !quotation) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })

    const { data: items, error: itemErr } = await admin
      .from('quotation_items')
      .select('*')
      .eq('quotation_id', id)
      .eq('organization_id', auth.profile.organization_id)
      .order('sort_order')

    if (itemErr) throw itemErr

    return NextResponse.json({ quotation, items: items ?? [] })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch quotation'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await getAdminProfile()
    if (auth.error) return auth.error

    const body = await request.json()
    const admin = createAdminClient() as unknown as UntypedSupabaseClient

    if (body.items !== undefined) {
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

      const { data: existingRaw } = await admin
        .from('quotations')
        .select('id, quotation_number, organization_id, status')
        .eq('id', id)
        .single()

      const existing = existingRaw as { id: string; quotation_number: string; organization_id: string; status: string } | null

      if (!existing || existing.organization_id !== auth.profile.organization_id) {
        return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
      }
      if (existing.status === 'converted') {
        return NextResponse.json({ error: 'Converted quotations cannot be edited' }, { status: 400 })
      }

      const validationError = await validateCustomerAndWorkOrder(admin, auth.profile.organization_id, customer_id, work_order_id)
      if (validationError) return validationError

      const subtotal = cleanItems.reduce((sum: number, item: QuotationItemInput) => sum + item.quantity * item.unit_price, 0)
      const discount = Math.max(0, Number(discount_amount ?? 0))
      const total = Math.max(0, subtotal - discount)

      const { error: updateErr } = await admin
        .from('quotations')
        .update({
          customer_id,
          work_order_id: work_order_id || null,
          quotation_date,
          valid_until: valid_until || null,
          subtotal,
          discount_amount: discount,
          tax_amount: 0,
          total_amount: total,
          notes: notes?.trim() || null,
          terms_and_conditions: terms_and_conditions?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('organization_id', auth.profile.organization_id)

      if (updateErr) throw updateErr

      await admin.from('quotation_items').delete().eq('quotation_id', id).eq('organization_id', auth.profile.organization_id)
      const rows = cleanItems.map((item: QuotationItemInput, index: number) => ({
        organization_id: auth.profile.organization_id,
        quotation_id: id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.quantity * item.unit_price,
        sort_order: index,
      }))
      const { error: itemErr } = await admin.from('quotation_items').insert(rows)
      if (itemErr) throw itemErr

      await logAudit({ orgId: auth.profile.organization_id, userId: auth.user.id, action: 'update', entityType: 'quotation', entityId: id, entityLabel: existing.quotation_number })
      return NextResponse.json({ success: true, id })
    }

    const allowedStatuses = ['draft', 'sent', 'approved', 'rejected', 'converted', 'expired']
    const updatePayload: Record<string, unknown> = {}
    if ('status' in body) {
      if (!allowedStatuses.includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      updatePayload.status = body.status
    }
    if ('notes' in body) updatePayload.notes = body.notes?.trim() || null
    if ('terms_and_conditions' in body) updatePayload.terms_and_conditions = body.terms_and_conditions?.trim() || null

    if (Object.keys(updatePayload).length === 0) return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })

    const { data: updated, error } = await admin
      .from('quotations')
      .update({ ...updatePayload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', auth.profile.organization_id)
      .select('id, quotation_number, status')
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, quotation: updated })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update quotation'
    console.error('Update quotation error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await getAdminProfile()
    if (auth.error) return auth.error

    const admin = createAdminClient() as unknown as UntypedSupabaseClient
    const { data: existingRaw } = await admin
      .from('quotations')
      .select('id, quotation_number, organization_id, status')
      .eq('id', id)
      .single()

    const existing = existingRaw as { id: string; quotation_number: string; organization_id: string; status: string } | null

    if (!existing || existing.organization_id !== auth.profile.organization_id) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }
    if (existing.status === 'converted') {
      return NextResponse.json({ error: 'Converted quotations cannot be deleted' }, { status: 400 })
    }

    await admin.from('quotation_items').delete().eq('quotation_id', id).eq('organization_id', auth.profile.organization_id)
    const { error } = await admin.from('quotations').delete().eq('id', id).eq('organization_id', auth.profile.organization_id)
    if (error) throw error

    await logAudit({ orgId: auth.profile.organization_id, userId: auth.user.id, action: 'delete', entityType: 'quotation', entityId: id, entityLabel: existing.quotation_number })
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete quotation'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
