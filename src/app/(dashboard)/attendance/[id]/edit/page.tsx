import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { notFound, redirect } from 'next/navigation'
import { EditAttendanceForm } from './EditAttendanceForm'

export const metadata = { title: 'Edit Attendance' }

export default async function EditAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await (supabase as any).from('users').select('role').eq('id', user!.id).single()
  const role = (profileRaw as { role: string } | null)?.role ?? ''

  if (!['owner', 'admin', 'manager'].includes(role)) {
    redirect('/attendance')
  }

  const admin = createAdminClient() as any
  const { data: recordRaw } = await admin
    .from('attendance')
    .select('id, date, status, check_in, check_out, hours_worked, overtime_hours, notes, staff(full_name)')
    .eq('id', id)
    .single()

  if (!recordRaw) notFound()

  return (
    <div className="animate-fade-in">
      <Header title="Edit Attendance" subtitle={`Editing record for ${recordRaw.staff?.full_name ?? '—'}`} />
      <div className="p-6">
        <EditAttendanceForm record={recordRaw} />
      </div>
    </div>
  )
}
