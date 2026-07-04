import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profileRaw } = await (supabase as any).from('users').select('organization_id, role').eq('id', user.id).single()
  const profile = profileRaw as { organization_id: string; role: string } | null
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only owner or admin can reset a payroll run' }, { status: 403 })
  }

  const admin = createAdminClient() as any

  // Verify this run belongs to this org and is in draft/pending status (not paid)
  const { data: run } = await admin
    .from('salary_runs')
    .select('id, status')
    .eq('id', runId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (run.status === 'paid') {
    return NextResponse.json({ error: 'Cannot reset a payroll run that has already been paid out' }, { status: 409 })
  }

  // Restore advance_balance for staff whose deductions were applied
  const { data: slips } = await admin
    .from('salary_slips')
    .select('staff_id, advance_deduction')
    .eq('salary_run_id', runId)
    .gt('advance_deduction', 0)

  for (const slip of (slips ?? []) as Array<{ staff_id: string; advance_deduction: number }>) {
    const { data: staffRec } = await admin.from('staff').select('advance_balance').eq('id', slip.staff_id).single()
    if (staffRec) {
      await admin.from('staff').update({ advance_balance: (staffRec.advance_balance ?? 0) + slip.advance_deduction }).eq('id', slip.staff_id)
    }
  }

  // Delete slips then the run
  await admin.from('salary_slips').delete().eq('salary_run_id', runId)
  await admin.from('salary_runs').delete().eq('id', runId)

  return NextResponse.json({ success: true })
}
