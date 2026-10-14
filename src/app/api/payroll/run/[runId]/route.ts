import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Payroll tables trail the hand-maintained Database type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseDb = supabase as any
  const { data: profileRaw } = await supabaseDb
    .from('users')
    .select('organization_id, role, status')
    .eq('id', user.id)
    .single()
  const profile = profileRaw as {
    organization_id: string
    role: string
    status: string
  } | null
  if (!profile || profile.status !== 'active' || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only owner or admin can reset a payroll run' }, { status: 403 })
  }

  // The hand-maintained Database type does not include generated relationship
  // metadata, so Supabase cannot infer RPC arguments from it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { error } = await admin.rpc('reset_payroll_run', {
    p_org_id: profile.organization_id,
    p_reset_by: user.id,
    p_run_id: runId,
  })

  if (error) {
    const rawMessage = error.message ?? ''
    const message = rawMessage.replace(/^Error:\s*/, '')
    if (message === 'Payroll run not found') {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    if (message.includes('already been paid out')) {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    console.error('Reset payroll run error:', error)
    return NextResponse.json({ error: 'Unable to reset the payroll run' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
