import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NewAttendanceForm } from './NewAttendanceForm'

export const metadata = { title: 'Mark Attendance' }

export default async function NewAttendancePage() {
  const supabase = await createClient()

  const { data: staffRaw } = await supabase
    .from('staff')
    .select('id, full_name, designation')
    .eq('employment_status', 'active')
    .order('full_name')

  const staff = (staffRaw ?? []) as Array<{
    id: string
    full_name: string
    designation: string | null
  }>

  return (
    <div className="animate-fade-in">
      <Header
        title="Mark Attendance"
        subtitle="Record attendance for a staff member"
        actions={
          <Link
            href="/attendance"
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />
      <div className="p-6">
        <NewAttendanceForm staff={staff} />
      </div>
    </div>
  )
}
