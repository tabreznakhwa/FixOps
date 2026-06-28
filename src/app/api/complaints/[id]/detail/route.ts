import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient() as any
    const { data, error } = await supabase
      .from('complaints')
      .select('id, complaint_number, service_category, priority, description, location, preferred_date, preferred_time, notes, status')
      .eq('id', id)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })
    return NextResponse.json({ complaint: data })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
