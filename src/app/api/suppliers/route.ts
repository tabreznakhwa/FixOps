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
      supplier_name,
      contact_person,
      mobile_number,
      email,
      city,
      address,
      payment_terms,
      notes,
    } = body

    if (!supplier_name?.trim()) return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })

    const supabase = createAdminClient()

    const { data: seqData } = await (supabase as any).rpc('generate_sequence_number', {
      p_org_id: profile.organization_id,
      p_type: 'supplier',
      p_prefix: 'SUP',
    })
    const supplierCode = seqData ?? `SUP-${Date.now()}`

    const { data: supplier, error } = await (supabase as any)
      .from('suppliers')
      .insert({
        organization_id: profile.organization_id,
        supplier_code: supplierCode,
        supplier_name: supplier_name.trim(),
        contact_person: contact_person?.trim() || null,
        mobile_number: mobile_number?.trim() || null,
        email: email?.trim() || null,
        city: city?.trim() || null,
        address: address?.trim() || null,
        payment_terms: Number(payment_terms ?? 0),
        status: 'active',
        notes: notes?.trim() || null,
        created_by: user.id,
      })
      .select('id, supplier_code')
      .single()

    if (error) throw error

    return NextResponse.json({ id: supplier.id, supplier_code: supplier.supplier_code })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Create supplier error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
