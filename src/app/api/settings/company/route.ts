import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function getProfile(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await (supabase as any).from('users').select('organization_id, role').eq('id', user.id).single()
  return data as { organization_id: string; role: string } | null
}

export async function GET() {
  const supabase = await createClient()
  const profile = await getProfile(supabase)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient() as any
  const { data } = await admin.from('organizations')
    .select('name, email, phone, address, city, country, currency, vat_number, vat_rate, logo_url, bank_name, bank_account_number, bank_iban, bank_swift, opening_cash_balance, opening_bank_balance, opening_balance_date')
    .eq('id', profile.organization_id)
    .single()

  return NextResponse.json(data ?? {})
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const profile = await getProfile(supabase)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(profile.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  if (!body.name?.trim()) return NextResponse.json({ error: 'Company name is required' }, { status: 400 })

  const admin = createAdminClient() as any
  const { error } = await admin.from('organizations').update({
    name: body.name.trim(),
    email: body.email || null,
    phone: body.phone || null,
    address: body.address || null,
    city: body.city || null,
    country: body.country || null,
    currency: body.currency || 'KWD',
    vat_number: body.vat_number || null,
    vat_rate: body.vat_rate ? Number(body.vat_rate) : null,
    logo_url: body.logo_url || null,
    bank_name: body.bank_name || null,
    bank_account_number: body.bank_account_number || null,
    bank_iban: body.bank_iban || null,
    bank_swift: body.bank_swift || null,
    opening_cash_balance: body.opening_cash_balance != null ? Number(body.opening_cash_balance) : 0,
    opening_bank_balance: body.opening_bank_balance != null ? Number(body.opening_bank_balance) : 0,
    opening_balance_date: body.opening_balance_date || null,
    updated_at: new Date().toISOString(),
  }).eq('id', profile.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
