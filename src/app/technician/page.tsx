import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TechnicianDashboard } from '@/components/technician/TechnicianDashboard'
import { kuwaitISODate } from '@/lib/attendance'

export const metadata = { title: 'My Jobs' }

export default async function TechnicianPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRaw } = await supabase
    .from('users')
    .select('full_name, role, status')
    .eq('id', user.id)
    .single()

  const profile = profileRaw as unknown as { full_name: string; role: string; status: string } | null

  if (!profile || profile.status !== 'active') redirect('/pending')
  if (profile.role !== 'technician') redirect('/dashboard')

  const { data: jobsRaw } = await supabase
    .from('work_orders')
    .select('id, work_order_number, job_description, priority, status, scheduled_date, scheduled_time, customers(full_name, mobile_number, address, area, map_location_url)')
    .eq('assigned_to', user.id)
    .not('status', 'in', '(cancelled,paid,invoiced)')
    .order('scheduled_date', { ascending: true })

  const jobs = (jobsRaw as unknown as Parameters<typeof TechnicianDashboard>[0]['jobs']) ?? []

  const { data: staffRaw } = await (supabase as any)
    .from('staff')
    .select('id')
    .eq('user_id', user.id)
    .eq('employment_status', 'active')
    .maybeSingle()
  const staffId = (staffRaw as { id: string } | null)?.id ?? null

  let todayAttendance: { check_in: string | null; check_out: string | null } | null = null
  if (staffId) {
    const { data: attRaw } = await (supabase as any)
      .from('attendance')
      .select('check_in, check_out')
      .eq('staff_id', staffId)
      .eq('date', kuwaitISODate())
      .maybeSingle()
    todayAttendance = attRaw ?? null
  }

  return (
    <TechnicianDashboard
      jobs={jobs}
      technicianName={profile.full_name}
      staffLinked={Boolean(staffId)}
      initialAttendance={todayAttendance}
    />
  )
}
