import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { notFound, redirect } from 'next/navigation'
import { EditAttendanceForm } from './EditAttendanceForm'
import { BackButton } from '@/components/ui/BackButton'
import { resolveBack } from '@/lib/backNav'

export const metadata = { title: 'Edit Attendance' }

export default async function EditAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ return_to?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const back = resolveBack(query.return_to, '/attendance', 'Attendance')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileRaw } = await supabase.from('users').select('organization_id, role').eq('id', user.id).single()
  const profile = profileRaw as { organization_id: string; role: string } | null
  const role = profile?.role ?? ''

  if (!profile || !['owner', 'admin', 'hr', 'manager'].includes(role)) {
    redirect('/attendance')
  }

  // Attendance is not represented in the hand-maintained Database type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: recordRaw } = await admin
    .from('attendance')
    .select('id, staff_id, date, status, check_in, check_out, hours_worked, overtime_hours, notes, is_public_holiday, friday_ot_amount, leave_application_id, staff(full_name, friday_ot_amount)')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .maybeSingle()

  if (!recordRaw) notFound()
  if (recordRaw.leave_application_id) {
    const managedLeaveDestination = new URL(back.href, 'http://localhost')
    managedLeaveDestination.searchParams.set('error', 'managed_leave')
    redirect(`${managedLeaveDestination.pathname}${managedLeaveDestination.search}${managedLeaveDestination.hash}`)
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Edit Attendance"
        subtitle={`Editing record for ${recordRaw.staff?.full_name ?? '—'}`}
        actions={<BackButton href={back.href} label={back.label} />}
      />
      <div className="p-6">
        <EditAttendanceForm record={recordRaw} returnTo={back.href} />
      </div>
    </div>
  )
}
