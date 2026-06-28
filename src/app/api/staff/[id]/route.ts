import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: staffId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profileRaw } = await (supabase as any)
      .from('users')
      .select('organization_id, full_name, role')
      .eq('id', user.id)
      .single()
    const profile = profileRaw as { organization_id: string; full_name: string; role: string } | null
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!['owner', 'admin', 'hr', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const admin = createAdminClient() as any

    // Verify staff belongs to same org
    const { data: existing } = await admin.from('staff').select('organization_id, full_name').eq('id', staffId).single()
    if (!existing || existing.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const updates = {
      full_name: body.full_name,
      designation: body.designation || null,
      department: body.department || null,
      mobile_number: body.mobile_number || null,
      email: body.email || null,
      nationality: body.nationality || null,
      passport_number: body.passport_number || null,
      visa_number: body.visa_number || null,
      emirates_id: body.emirates_id || null,
      visa_expiry_date: body.visa_expiry_date || null,
      passport_expiry_date: body.passport_expiry_date || null,
      basic_salary: Number(body.basic_salary ?? 0),
      housing_allowance: 0,
      transport_allowance: 0,
      food_allowance: Number(body.food_allowance ?? 0),
      other_allowance: Number(body.other_allowance ?? 0),
      allowance_name: body.allowance_name?.trim() || 'Allowance',
      fixed_overtime_monthly: Number(body.fixed_overtime_monthly ?? 0),
      overtime_eligible: Boolean(body.overtime_eligible),
      bank_name: body.bank_name || null,
      iban: body.iban || null,
      employment_status: body.employment_status,
      notes: body.notes || null,
    }

    const { error } = await admin.from('staff').update(updates).eq('id', staffId)
    if (error) throw error

    await logAudit({
      orgId: profile.organization_id,
      userId: user.id,
      userName: profile.full_name,
      action: 'update',
      entityType: 'staff',
      entityId: staffId,
      entityLabel: existing.full_name,
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
