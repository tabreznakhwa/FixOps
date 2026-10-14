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

    // Staff profile tables and RPCs trail the hand-maintained Database relationships.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profileRaw } = await (supabase as any)
      .from('users')
      .select('organization_id, full_name, role, status')
      .eq('id', user.id)
      .single()
    const profile = profileRaw as {
      organization_id: string
      full_name: string
      role: string
      status: string
    } | null
    if (!profile?.organization_id || profile.status !== 'active') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!['owner', 'admin', 'hr', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any

    // Verify staff belongs to same org and get current opening balances for delta calculation
    const { data: existing } = await admin.from('staff').select('organization_id, full_name, opening_advance, opening_loan, advance_balance').eq('id', staffId).single()
    if (!existing || existing.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Link/unlink to a login account — handled separately since it's a partial update from StaffLoginLink
    if ('user_id' in body && Object.keys(body).length === 1) {
      if (body.user_id) {
        const { data: targetUser } = await admin.from('users').select('organization_id').eq('id', body.user_id).single()
        if (!targetUser || targetUser.organization_id !== profile.organization_id) {
          return NextResponse.json({ error: 'User not found in this organization' }, { status: 400 })
        }
        const { data: alreadyLinked } = await admin.from('staff').select('id').eq('user_id', body.user_id).neq('id', staffId).maybeSingle()
        if (alreadyLinked) {
          return NextResponse.json({ error: 'That login is already linked to another staff member' }, { status: 400 })
        }
      }
      const { error: linkError } = await admin
        .from('staff')
        .update({ user_id: body.user_id || null })
        .eq('id', staffId)
        .eq('organization_id', profile.organization_id)
      if (linkError) throw linkError
      return NextResponse.json({ success: true })
    }

    const newOpeningAdvance = Number(body.opening_advance ?? 0)
    const newOpeningLoan = Number(body.opening_loan ?? 0)
    if (!Number.isFinite(newOpeningAdvance) || newOpeningAdvance < 0
      || !Number.isFinite(newOpeningLoan) || newOpeningLoan < 0) {
      return NextResponse.json({ error: 'Opening advance and loan cannot be negative' }, { status: 400 })
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
      friday_ot_amount: Number(body.friday_ot_amount ?? 0),
      opening_advance: newOpeningAdvance,
      opening_loan: newOpeningLoan,
      overtime_eligible: Boolean(body.overtime_eligible),
      bank_name: body.bank_name || null,
      iban: body.iban || null,
      employment_status: body.employment_status,
      notes: body.notes || null,
    }

    const { error } = await admin.rpc('update_staff_profile_with_opening_balance', {
      p_org_id: profile.organization_id,
      p_updated_by: user.id,
      p_staff_id: staffId,
      p_expected_opening_advance: Number(existing.opening_advance ?? 0),
      p_expected_opening_loan: Number(existing.opening_loan ?? 0),
      p_updates: updates,
    })
    if (error) {
      const message = error.message?.replace(/^Error:\s*/, '') ?? ''
      if (message.includes('opening balance changed')) {
        return NextResponse.json({ error: message }, { status: 409 })
      }
      throw error
    }

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
