import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabaseUser as any)
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const supabase = createAdminClient()

    // Full edit (all contract fields)
    if (body.edit === true) {
      const {
        customer_id, contract_type, start_date, end_date, contract_amount,
        billing_frequency, services_included, visits_included, parts_included,
        payment_terms, notes, renewal_reminder_date,
      } = body
      if (!customer_id || !start_date || !end_date) {
        return NextResponse.json({ error: 'Customer, start date and end date are required' }, { status: 400 })
      }
      const { error } = await (supabase as any)
        .from('amc_contracts')
        .update({
          customer_id, contract_type: contract_type || null,
          start_date, end_date,
          contract_amount: Number(contract_amount ?? 0),
          billing_frequency: billing_frequency || 'monthly',
          services_included: Array.isArray(services_included) ? services_included : [],
          visits_included: Number(visits_included ?? 0),
          parts_included: !!parts_included,
          payment_terms: Number(payment_terms ?? 0),
          notes: notes || null,
          renewal_reminder_date: renewal_reminder_date || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // Quick update (status / visits / notes)
    const ALLOWED_FIELDS = ['status', 'visits_used', 'notes', 'end_date', 'renewal_reminder_date']
    const updatePayload: Record<string, unknown> = {}
    for (const field of ALLOWED_FIELDS) {
      if (field in body) updatePayload[field] = body[field]
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data: updated, error } = await (supabase as any)
      .from('amc_contracts')
      .update({ ...updatePayload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, contract_number, status, visits_used')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, contract: updated })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Update AMC error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
