import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { lat, lng, accuracy } = await request.json()
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'lat/lng required' }, { status: 400 })
    }

    const admin = createAdminClient() as any
    const { data: staff } = await admin
      .from('staff')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .eq('employment_status', 'active')
      .maybeSingle()
    if (!staff) return NextResponse.json({ error: 'Not linked to a staff profile' }, { status: 400 })

    const { error } = await admin
      .from('technician_locations')
      .upsert({
        organization_id: staff.organization_id,
        staff_id: staff.id,
        lat,
        lng,
        accuracy: typeof accuracy === 'number' ? accuracy : null,
        recorded_at: new Date().toISOString(),
      }, { onConflict: 'staff_id' })
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
