import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Turns "Client Gifts" into "client_gifts" to match the snake_case value style of the built-in categories. */
function toValue(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await (supabase as any)
    .from('expense_categories')
    .select('id, value, label')
    .order('label')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabase as any)
      .from('users').select('organization_id, role').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    if (!['owner', 'admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Only owner, admin, or manager can add expense types' }, { status: 403 })
    }

    const body = await request.json()
    const label = String(body.label ?? '').trim()
    if (!label) return NextResponse.json({ error: 'Please enter a name for the expense type' }, { status: 400 })

    const value = toValue(label)
    if (!value) return NextResponse.json({ error: 'Please enter a valid name' }, { status: 400 })

    // RLS enforces the role check server-side too (belt and suspenders) — this
    // client just relies on it rather than duplicating org_id in the insert.
    const { data, error } = await (supabase as any)
      .from('expense_categories')
      .insert({ organization_id: profile.organization_id, value, label, created_by: user.id })
      .select('id, value, label')
      .single()

    if (error) {
      // Unique violation — someone already added this exact type.
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This expense type already exists' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Expense category POST error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to add expense type'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
