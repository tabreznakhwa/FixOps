import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { formatCurrency } from '@/lib/utils'
import { BonusesList } from './BonusesList'

export const metadata = { title: 'Bonuses' }

export default async function BonusesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRaw } = await (supabase as any)
    .from('users').select('organization_id, role').eq('id', user.id).single()
  const profile = profileRaw as { organization_id: string; role: string } | null
  if (!profile) redirect('/login')

  const canEdit = ['owner', 'admin', 'hr', 'manager'].includes(profile.role)

  const [{ data: bonusesRaw }, { data: staffRaw }] = await Promise.all([
    (supabase as any)
      .from('staff_bonuses')
      .select('id, bonus_number, bonus_date, amount, payment_mode, notes, is_voided, void_reason, created_at, staff(full_name)')
      .order('bonus_date', { ascending: false })
      .limit(1000),
    (supabase as any)
      .from('staff')
      .select('id, full_name, staff_code, employment_status')
      .eq('organization_id', profile.organization_id)
      .order('full_name'),
  ])

  type Bonus = {
    id: string; bonus_number: string; bonus_date: string; amount: number
    payment_mode: string; notes: string | null; is_voided: boolean; void_reason: string | null
    created_at: string; staff: { full_name: string } | null
  }
  type Staff = { id: string; full_name: string; staff_code: string; employment_status: string }

  const bonuses = (bonusesRaw ?? []) as Bonus[]
  const staffListRaw = (staffRaw ?? []) as Staff[]
  // Active staff first in the dropdown, then former employees for history.
  const staff = staffListRaw.sort((a, b) => {
    if (a.employment_status === 'active' && b.employment_status !== 'active') return -1
    if (a.employment_status !== 'active' && b.employment_status === 'active') return 1
    return a.full_name.localeCompare(b.full_name)
  })

  const active = bonuses.filter((b) => !b.is_voided)
  const totalAll = active.reduce((s, b) => s + Number(b.amount), 0)
  const now = new Date()
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const totalThisMonth = active
    .filter((b) => b.bonus_date.startsWith(monthStr))
    .reduce((s, b) => s + Number(b.amount), 0)

  return (
    <div className="animate-fade-in">
      <Header
        title="Bonuses"
        subtitle="One-off appreciation payments to employees, outside the payroll run"
      />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Bonuses (All Time)</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totalAll)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">This Month</p>
            <p className="text-xl font-bold text-amber-600">{formatCurrency(totalThisMonth)}</p>
          </div>
        </div>

        <BonusesList bonuses={bonuses} staff={staff} canEdit={canEdit} />
      </div>
    </div>
  )
}
