import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'

interface ManualPayrollEntry {
  staff_id: string
  food_deduction: number
  advance_deduction: number
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: {
    month?: unknown
    year?: unknown
    entries?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const month = Number(body.month)
  const year = Number(body.year)
  const entries = body.entries

  if (!Number.isInteger(month) || month < 1 || month > 12
    || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Enter a valid payroll month and year' }, { status: 400 })
  }
  if (!Array.isArray(entries)) {
    return NextResponse.json({ error: 'Invalid payroll entries' }, { status: 400 })
  }

  const manualEntries: ManualPayrollEntry[] = []
  for (const rawEntry of entries) {
    if (!rawEntry || typeof rawEntry !== 'object') {
      return NextResponse.json({ error: 'Invalid payroll entry' }, { status: 400 })
    }

    const entry = rawEntry as Record<string, unknown>
    const normalized = {
      staff_id: typeof entry.staff_id === 'string' ? entry.staff_id : '',
      food_deduction: entry.food_deduction,
      advance_deduction: entry.advance_deduction,
    }
    if (!normalized.staff_id
      || typeof normalized.food_deduction !== 'number'
      || typeof normalized.advance_deduction !== 'number'
      || !Number.isFinite(normalized.food_deduction)
      || normalized.food_deduction < 0
      || !Number.isFinite(normalized.advance_deduction)
      || normalized.advance_deduction < 0) {
      return NextResponse.json({ error: 'Payroll entries must contain non-negative numbers' }, { status: 400 })
    }
    manualEntries.push({
      staff_id: normalized.staff_id,
      food_deduction: normalized.food_deduction,
      advance_deduction: normalized.advance_deduction,
    })
  }

  const { data: profileRaw } = await supabase
    .from('users')
    .select('organization_id, role, status, full_name')
    .eq('id', user.id)
    .single()
  const profile = profileRaw as unknown as {
    organization_id: string
    role: string
    status: string
    full_name: string
  } | null
  if (!profile?.organization_id || profile.status !== 'active') {
    return NextResponse.json({ error: 'No active organization profile found' }, { status: 403 })
  }
  if (!['owner', 'admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  // The hand-maintained Database type does not include generated relationship
  // metadata, so Supabase cannot infer RPC arguments from it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminDb = admin as any
  const { data: runId, error } = await adminDb.rpc('process_payroll', {
    p_org_id: profile.organization_id,
    p_processed_by: user.id,
    p_month: month,
    p_year: year,
    p_manual_entries: manualEntries,
  })

  if (error) {
    const rawMessage = error.message?.replace(/^Error:\s*/, '') ?? ''
    const knownMessage = [
      'Enter a valid payroll month and year',
      'Invalid payroll entries',
      'Invalid payroll entry',
      'No active staff found',
      'Payroll entries are incomplete or duplicated',
      'A payroll entry does not belong to an active employee in this organization',
      'Cannot process payroll because attendance is incomplete for',
      'Cannot process payroll while pending leave applications overlap this month',
      'Payroll already processed for this month',
      'The active employee list changed while payroll was being prepared',
      'Advance deduction exceeds the outstanding balance for',
      'Deductions exceed gross salary for',
    ].find((message) => rawMessage.includes(message))
    if (!knownMessage) {
      console.error('Process payroll RPC error:', error)
      return NextResponse.json({ error: 'Unable to process payroll' }, { status: 500 })
    }

    const status = knownMessage.includes('already processed')
      || knownMessage.includes('pending leave')
      || knownMessage.includes('incomplete or duplicated')
      || knownMessage.includes('active employee list changed')
      ? 409
      : 400
    return NextResponse.json({ error: rawMessage }, { status })
  }

  await logAudit({
    orgId: profile.organization_id,
    userId: user.id,
    userName: profile.full_name,
    action: 'process_payroll',
    entityType: 'salary_run',
    entityId: runId,
    entityLabel: `Payroll ${String(month).padStart(2, '0')}/${year}`,
    changes: { month, year, employees: manualEntries.length },
  })

  return NextResponse.json({ success: true, runId })
}
