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

    const ALLOWED_FIELDS = [
      'supplier_name', 'contact_person', 'mobile_number',
      'email', 'city', 'address', 'payment_terms', 'status', 'notes',
    ]
    const updatePayload: Record<string, unknown> = {}

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        updatePayload[field] = body[field]
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: updated, error } = await (supabase as any)
      .from('suppliers')
      .update({ ...updatePayload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, supplier_code, supplier_name, status')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, supplier: updated })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Update supplier error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
