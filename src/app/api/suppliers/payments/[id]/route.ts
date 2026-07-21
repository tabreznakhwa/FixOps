import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabase as any)
      .from('users').select('organization_id, role').eq('id', user.id).single()
    const profile = profileRaw as { organization_id: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['owner', 'admin', 'manager', 'accounts'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const allowed: Record<string, unknown> = {}
    if (body.payment_mode !== undefined) allowed.payment_mode = body.payment_mode
    if (body.reference_number !== undefined) allowed.reference_number = body.reference_number?.trim() || null
    if (body.notes !== undefined) allowed.notes = body.notes?.trim() || null
    if (body.payment_date !== undefined) allowed.payment_date = body.payment_date

    const admin = createAdminClient() as any
    const { error } = await admin
      .from('supplier_payments')
      .update(allowed)
      .eq('id', id)
      .eq('organization_id', profile.organization_id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Update failed' }, { status: 500 })
  }
}
