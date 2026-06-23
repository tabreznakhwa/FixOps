import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await (supabaseUser as any)
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { is_cancelled, cancelled_reason } = body

    if (is_cancelled !== true) {
      return NextResponse.json({ error: 'Only cancellation is supported via this endpoint' }, { status: 400 })
    }

    if (!cancelled_reason?.trim()) {
      return NextResponse.json({ error: 'Cancellation reason is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: updated, error } = await (supabase as any)
      .from('payments')
      .update({
        is_cancelled: true,
        cancelled_reason: cancelled_reason.trim(),
        cancelled_by: user.id,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, payment_number, is_cancelled')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, payment: updated })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('Cancel payment error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
