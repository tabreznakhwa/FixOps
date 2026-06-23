import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
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
    const {
      full_name, designation, department,
      mobile_number, email, nationality,
      joining_date, basic_salary,
      housing_allowance, other_allowance,
      visa_expiry_date, passport_number, visa_number,
      notes,
    } = body

    if (!full_name?.trim()) return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
    if (!joining_date) return NextResponse.json({ error: 'Joining date is required' }, { status: 400 })
    if (!basic_salary || Number(basic_salary) <= 0) return NextResponse.json({ error: 'Basic salary is required' }, { status: 400 })

    const supabase = createAdminClient()

    const { data: seqData } = await (supabase as any).rpc('generate_sequence_number', {
      p_org_id: profile.organization_id,
      p_type: 'staff',
      p_prefix: 'EMP',
    })

    const { data: staff, error } = await (supabase as any)
      .from('staff')
      .insert({
        organization_id: profile.organization_id,
        staff_code: seqData ?? `EMP-${Date.now()}`,
        full_name: full_name.trim(),
        designation: designation?.trim() || null,
        department: department || null,
        mobile_number: mobile_number?.trim() || null,
        email: email?.trim() || null,
        nationality: nationality?.trim() || null,
        joining_date,
        basic_salary: Number(basic_salary),
        housing_allowance: Number(housing_allowance) || 0,
        other_allowance: Number(other_allowance) || 0,
        visa_expiry_date: visa_expiry_date || null,
        passport_number: passport_number?.trim() || null,
        visa_number: visa_number?.trim() || null,
        employment_status: 'active',
        notes: notes?.trim() || null,
        created_by: user.id,
      })
      .select('id, staff_code')
      .single()

    if (error) {
      console.error('Staff insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: staff.id, staffCode: staff.staff_code })
  } catch (err) {
    console.error('Create staff error:', err)
    return NextResponse.json({ error: 'Failed to add staff member' }, { status: 500 })
  }
}
