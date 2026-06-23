import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
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
    const {
      customer_id,
      contract_type,
      start_date,
      end_date,
      contract_amount,
      billing_frequency,
      services_included,
      visits_included,
      parts_included,
      payment_terms,
      notes,
    } = body

    if (!customer_id) return NextResponse.json({ error: 'Customer is required' }, { status: 400 })
    if (!start_date) return NextResponse.json({ error: 'Start date is required' }, { status: 400 })
    if (!end_date) return NextResponse.json({ error: 'End date is required' }, { status: 400 })

    const supabase = createAdminClient()

    const { data: seqData } = await (supabase as any).rpc('generate_sequence_number', {
      p_org_id: profile.organization_id,
      p_type: 'amc_contract',
      p_prefix: 'AMC',
    })
    const contractNumber = seqData ?? `AMC-${Date.now()}`

    const { data: contract, error } = await (supabase as any)
      .from('amc_contracts')
      .insert({
        organization_id: profile.organization_id,
        contract_number: contractNumber,
        customer_id,
        contract_type: contract_type ?? null,
        start_date,
        end_date,
        contract_amount: Number(contract_amount ?? 0),
        billing_frequency: billing_frequency ?? 'yearly',
        services_included: Array.isArray(services_included) ? services_included : [],
        visits_included: Number(visits_included ?? 0),
        visits_used: 0,
        parts_included: Boolean(parts_included),
        payment_terms: Number(payment_terms ?? 0),
        status: 'active',
        notes: notes?.trim() ?? null,
        created_by: user.id,
      })
      .select('id, contract_number')
      .single()

    if (error) throw error

    return NextResponse.json({ id: contract.id, contract_number: contract.contract_number })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Create AMC error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
