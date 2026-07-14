import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { kuwaitISODate } from '@/lib/attendance'
import { MyAttendanceDashboard } from './MyAttendanceDashboard'
import { redirect } from 'next/navigation'

export const metadata = { title: 'My Attendance' }

export default async function MyAttendancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient() as any

  const { data: staffRecord } = await admin
    .from('staff')
    .select('id, full_name, organization_id')
    .eq('user_id', user.id)
    .eq('employment_status', 'active')
    .maybeSingle()

  const today = kuwaitISODate()
  let todayAttendance = null
  let recentRecords: Array<{
    id: string; date: string; check_in: string | null; check_out: string | null
    hours_worked: number; overtime_hours: number; friday_ot_amount: number
    is_public_holiday: boolean; status: string
  }> = []

  if (staffRecord) {
    const { data: todayRec } = await admin
      .from('attendance')
      .select('id, check_in, check_out, hours_worked, overtime_hours, status')
      .eq('staff_id', staffRecord.id)
      .eq('date', today)
      .maybeSingle()
    todayAttendance = todayRec ?? null

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const fromDate = thirtyDaysAgo.toISOString().split('T')[0]

    const { data: records } = await admin
      .from('attendance')
      .select('id, date, check_in, check_out, hours_worked, overtime_hours, friday_ot_amount, is_public_holiday, status')
      .eq('staff_id', staffRecord.id)
      .gte('date', fromDate)
      .order('date', { ascending: false })
      .limit(30)
    recentRecords = (records ?? []) as typeof recentRecords
  }

  return (
    <div className="animate-fade-in">
      <Header title="My Attendance" subtitle="Clock in and out to record your hours" />
      <MyAttendanceDashboard
        staffLinked={!!staffRecord}
        initialAttendance={todayAttendance}
        recentRecords={recentRecords}
        today={today}
      />
    </div>
  )
}
