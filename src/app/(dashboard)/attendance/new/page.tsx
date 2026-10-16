import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { NewAttendanceForm } from './NewAttendanceForm'
import { redirect } from 'next/navigation'
import { resolveBack } from '@/lib/backNav'

export const metadata = { title: 'Mark Attendance' }

export default async function NewAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{
    locked_staff_id?: string
    return_to?: string | string[]
  }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Staff and attendance still trail the hand-maintained Database type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: profileRaw } = await admin
    .from('users')
    .select('organization_id, role, status')
    .eq('id', user.id)
    .maybeSingle()
  const profile = profileRaw as {
    organization_id: string
    role: string
    status: string
  } | null
  if (!profile?.organization_id || profile.status !== 'active') redirect('/login')

  const userRole = profile.role
  const isKiosk = userRole === 'attendance_kiosk'
  if (!isKiosk && !['owner', 'admin', 'hr', 'manager'].includes(userRole)) {
    redirect('/my-attendance')
  }

  // A kiosk is a shared device, so it may choose any active employee in its
  // own organization. Administrators can optionally arrive with one locked.
  const lockedStaffId = isKiosk ? null : params.locked_staff_id ?? null
  let staffQuery = admin
    .from('staff')
    .select('id, full_name, designation, friday_ot_amount')
    .eq('organization_id', profile.organization_id)
    .eq('employment_status', 'active')
    .order('full_name')

  if (lockedStaffId) {
    staffQuery = staffQuery.eq('id', lockedStaffId)
  }

  const { data: staffRaw, error: staffError } = await staffQuery
  if (staffError) throw new Error(staffError.message)

  const staff = (staffRaw ?? []) as Array<{
    id: string
    full_name: string
    designation: string | null
    friday_ot_amount: number
  }>

  const dateLockedToToday = !['owner', 'admin', 'hr', 'manager'].includes(userRole)
  const back = resolveBack(
    params.return_to,
    isKiosk ? '/my-attendance' : '/attendance',
    isKiosk ? 'My Attendance' : 'Attendance'
  )

  return (
    <div className="animate-fade-in">
      <Header
        title="Mark Attendance"
        subtitle="Record attendance for a staff member"
        actions={<BackButton href={back.href} label={back.label} />}
      />
      <div className="p-6">
        <NewAttendanceForm
          staff={staff}
          lockedStaffId={lockedStaffId}
          isKiosk={isKiosk}
          dateLockedToToday={dateLockedToToday}
          returnTo={back.href}
        />
      </div>
    </div>
  )
}
