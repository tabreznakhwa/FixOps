import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profileRaw } = await supabase
    .from('users').select('organization_id, full_name, role').eq('id', user.id).single()
  const profile = profileRaw as { organization_id: string; full_name: string; role: string } | null
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const fullName = (body.full_name ?? '').trim()
  const mobileNumber = (body.mobile_number ?? '').trim()
  if (!fullName) return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
  if (!mobileNumber) return NextResponse.json({ error: 'Mobile number is required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: customerCode } = await (admin as any).rpc('generate_sequence_number', {
    p_org_id: profile.organization_id,
    p_type: 'customer',
    p_prefix: 'CUST',
  })

  const { data: customer, error } = await (admin as any).from('customers').insert({
    organization_id: profile.organization_id,
    customer_code: customerCode ?? `CUST-${Date.now()}`,
    customer_type: body.customer_type || 'individual',
    full_name: fullName,
    company_name: body.company_name?.trim() || null,
    mobile_number: mobileNumber,
    area: body.area?.trim() || null,
    city: body.city?.trim() || null,
    status: 'active',
    created_by: user.id,
  }).select('id, customer_code, full_name, company_name, mobile_number').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(customer)
}
