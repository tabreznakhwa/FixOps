import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const PAYMENT_MODES = ['cash', 'bank_transfer', 'cheque'] as const

function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

interface SalaryPaymentEntry {
  slip_id: string
  payment_mode: typeof PAYMENT_MODES[number]
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Payroll tables trail the generated Database type.
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
  if (!profile?.organization_id || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!['owner', 'admin', 'manager', 'accounts'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { payment_date?: unknown; entries?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const paymentDate = typeof body.payment_date === 'string'
    ? body.payment_date
    : ''
  if (!isValidISODate(paymentDate)) {
    return NextResponse.json({ error: 'Enter a valid payment date' }, { status: 400 })
  }
  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json({ error: 'No entries provided' }, { status: 400 })
  }

  const entries: SalaryPaymentEntry[] = []
  const slipIds = new Set<string>()
  for (const rawEntry of body.entries) {
    if (!rawEntry || typeof rawEntry !== 'object') {
      return NextResponse.json({ error: 'Invalid salary payment entry' }, { status: 400 })
    }
    const entry = rawEntry as Record<string, unknown>
    if (typeof entry.slip_id !== 'string'
      || typeof entry.payment_mode !== 'string'
      || !PAYMENT_MODES.includes(entry.payment_mode as SalaryPaymentEntry['payment_mode'])) {
      return NextResponse.json({ error: 'Invalid salary payment entry' }, { status: 400 })
    }
    if (slipIds.has(entry.slip_id)) {
      return NextResponse.json({ error: 'Salary payment entries are duplicated' }, { status: 400 })
    }
    slipIds.add(entry.slip_id)
    entries.push({
      slip_id: entry.slip_id,
      payment_mode: entry.payment_mode as SalaryPaymentEntry['payment_mode'],
    })
  }

  // The hand-maintained Database type does not include generated relationship
  // metadata, so Supabase cannot infer RPC arguments from it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { error } = await admin.rpc('pay_salary_run', {
    p_org_id: profile.organization_id,
    p_paid_by: user.id,
    p_run_id: runId,
    p_payment_date: paymentDate,
    p_entries: entries,
  })

  if (error) {
    const rawMessage = error.message?.replace(/^Error:\s*/, '') ?? ''
    if (rawMessage === 'Payroll run not found') {
      return NextResponse.json({ error: rawMessage }, { status: 404 })
    }
    const knownMessage = [
      'Payment date is required',
      'No entries provided',
      'Invalid salary payment entry',
      'This payroll run has no pending salary slips',
      'Salary payment entries are incomplete or duplicated',
      'A salary payment entry does not belong to this pending payroll run',
      'No salary payments were updated',
      'Salary payment entries did not cover every payslip',
    ].find((message) => rawMessage.includes(message))
    if (!knownMessage) {
      console.error('Pay salary run RPC error:', error)
      return NextResponse.json({ error: 'Unable to mark salaries as paid' }, { status: 500 })
    }
    return NextResponse.json({ error: rawMessage }, { status: 409 })
  }

  return NextResponse.json({ success: true })
}
