import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

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

    const body = await request.json()
    const { supplier_id, advance_date, amount, payment_mode, reference_number, notes } = body

    if (!supplier_id) return NextResponse.json({ error: 'Supplier is required' }, { status: 400 })
    if (!amount || Number(amount) <= 0) return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })

    const admin = createAdminClient() as any

    // Generate advance number
    const { data: seqData } = await admin.rpc('generate_sequence_number', {
      p_org_id: profile.organization_id,
      p_type: 'supplier_advance',
      p_prefix: 'SADV',
    })
    const advanceNumber = seqData ?? `SADV-${Date.now()}`

    const amountNum = Number(amount)
    const { data: advance, error } = await admin
      .from('supplier_advances')
      .insert({
        organization_id: profile.organization_id,
        supplier_id,
        advance_number: advanceNumber,
        advance_date: advance_date ?? new Date().toISOString().split('T')[0],
        amount: amountNum,
        amount_utilized: 0,
        balance: amountNum,
        payment_mode: payment_mode ?? 'bank_transfer',
        reference_number: reference_number?.trim() || null,
        notes: notes?.trim() || null,
        paid_by: user.id,
      })
      .select('id, advance_number')
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, id: advance.id, advance_number: advance.advance_number })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient() as any
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplier_id')

    let query = admin
      .from('supplier_advances')
      .select('*, suppliers(supplier_name)')
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
