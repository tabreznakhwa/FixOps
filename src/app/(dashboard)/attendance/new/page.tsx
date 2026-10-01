import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { NewAttendanceForm } from './NewAttendanceForm'

export const metadata = { title: 'Mark Attendance' }

export default async function NewAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ locked_staff_id?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  // Check role server-side — kiosk always sees only their own staff record
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await (supabase as any)
    .from('users').select('role').eq('id', user!.id).single()
  const userRole = (profileRaw as { role: string } | null)?.role ?? ''
  const isKiosk = userRole === 'attendance_kiosk'

  let lockedStaffId: string | null = null

  if (isKiosk) {
    // Ignore URL param — always look up their linked staff record
    const { data: kioskStaff } = await (supabase as any)
      .from('staff').select('id').eq('user_id', user!.id).maybeSingle()
    lockedStaffId = (kioskStaff as { id: string } | null)?.id ?? null
  } else {
    lockedStaffId = params.locked_staff_id ?? null
  }

  let staffQuery = supabase
    .from('staff')
    .select('id, full_name, designation, friday_ot_amount')
    .eq('employment_status', 'active')
    .order('full_name')

  if (lockedStaffId) {
    staffQuery = (staffQuery as any).eq('id', lockedStaffId)
  }

  const { data: staffRaw } = await staffQuery

  const staff = (staffRaw ?? []) as Array<{
    id: string
    full_name: string
    designation: string | null
    friday_ot_amount: number
  }>

  const dateLockedToToday = !['owner', 'admin', 'hr', 'manager'].includes(userRole)

  return (
    <div className="animate-fade-in">
      <Header
        title="Mark Attendance"
        subtitle="Record attendance for a staff member"
        actions={
          <BackButton fallbackHref="/attendance" label="Back" />
        }
      />
      <div className="p-6">
        <NewAttendanceForm staff={staff} lockedStaffId={lockedStaffId} isKiosk={isKiosk} dateLockedToToday={dateLockedToToday} />
      </div>
    </div>
  )
}
