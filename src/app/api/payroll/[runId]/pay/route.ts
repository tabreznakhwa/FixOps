import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
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

  const { payment_mode, payment_date } = await request.json()
  if (!payment_mode || !payment_date) {
    return NextResponse.json({ error: 'Payment mode and date are required' }, { status: 400 })
  }

  const admin = createAdminClient() as any

  const { data: run } = await admin.from('salary_runs')
    .select('id, organization_id').eq('id', runId).single()
  if (!run || run.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error } = await admin.from('salary_slips').update({
    payment_status: 'paid',
    payment_mode,
    payment_date,
  }).eq('salary_run_id', runId).eq('payment_status', 'pending')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('salary_runs').update({ status: 'paid' }).eq('id', runId)

  return NextResponse.json({ success: true })
}
