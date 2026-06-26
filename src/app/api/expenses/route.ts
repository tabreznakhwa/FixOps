import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

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
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    if (!['owner', 'admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json()
    const { expense_date, category, description, amount, payment_method, reference_number, notes } = body

    if (!expense_date || !category || !description || !amount || !payment_method) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (Number(amount) <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { count } = await (admin as any)
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)

    const expense_number = `EXP-${String((count ?? 0) + 1).padStart(4, '0')}`

    const { data, error } = await (admin as any)
      .from('expenses')
      .insert({
        organization_id: profile.organization_id,
        expense_number,
        expense_date,
        category,
        description: description.trim(),
        amount: Number(amount),
        payment_method,
        reference_number: reference_number?.trim() || null,
        notes: notes?.trim() || null,
        created_by: user.id,
      })
      .select('id, expense_number')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    console.error('Expense POST error:', err)
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
  }
}
