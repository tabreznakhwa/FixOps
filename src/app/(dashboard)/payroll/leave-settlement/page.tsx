import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { LeaveSettlementForm } from './LeaveSettlementForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Leave Settlement' }

export default async function LeaveSettlementPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient() as any
  const { data: profileRaw } = await admin
    .from('users').select('organization_id, role').eq('id', user.id).single()
  const profile = profileRaw as { organization_id: string; role: string } | null

  // Pays money out — owner, admin and manager only.
  if (!profile || !['owner', 'admin', 'manager'].includes(profile.role)) {
    redirect('/dashboard?error=unauthorized')
  }

  const { data: staffRaw } = await admin
    .from('staff')
    .select('id, full_name, designation, basic_salary, advance_balance')
    .eq('organization_id', profile.organization_id)
    .eq('employment_status', 'active')
    .order('full_name')

  const staff = (staffRaw ?? []) as Array<{
    id: string; full_name: string; designation: string | null
    basic_salary: number; advance_balance: number | null
  }>

  return (
    <div className="animate-fade-in">
      <Header
        title="Leave Settlement"
        subtitle="Pay an employee up to their last working day before they travel"
        actions={<BackButton fallbackHref="/payroll" label="Payroll" />}
      />

      <div className="p-6 space-y-5">
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 max-w-2xl">
          <p className="text-sm text-blue-900">
            Pick the employee and the last day you are paying for. The salary is
            worked out pro-rata for those days, including any overtime already
            earned, and paid as a salary advance.
          </p>
          <p className="text-xs text-blue-800 mt-1.5">
            The month-end payroll run recovers it automatically, so the employee is
            not paid twice. No attendance needs to be marked in advance.
          </p>
        </div>

        <LeaveSettlementForm staff={staff} />
      </div>
    </div>
  )
}
