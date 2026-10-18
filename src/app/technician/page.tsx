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

  // Attendance and some staff columns trail the hand-maintained Database type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: staffRaw } = await (supabase as any)
    .from('staff')
    .select('id')
    .eq('user_id', user.id)
    .eq('employment_status', 'active')
    .maybeSingle()
  const staffId = (staffRaw as { id: string } | null)?.id ?? null

  let jobsQuery = supabase
    .from('work_orders')
    .select('id, work_order_number, job_description, priority, status, scheduled_date, scheduled_time, customers(full_name, mobile_number, address, area, map_location_url)')
    .not('status', 'in', '(cancelled,paid,invoiced)')

  jobsQuery = staffId
    ? jobsQuery.or(`assigned_to.eq.${user.id},assigned_staff_id.eq.${staffId}`)
    : jobsQuery.eq('assigned_to', user.id)

  const { data: jobsRaw } = await jobsQuery.order('scheduled_date', { ascending: true })
  const jobs = (jobsRaw as unknown as Parameters<typeof TechnicianDashboard>[0]['jobs']) ?? []

  let todayAttendance: { check_in: string | null; check_out: string | null; status: string } | null = null
  if (staffId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: attRaw } = await (supabase as any)
      .from('attendance')
      .select('check_in, check_out, status')
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
