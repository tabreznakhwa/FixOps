import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency } from '@/lib/utils'
import { WithdrawalsList } from './WithdrawalsList'

export const metadata = { title: 'Owner Withdrawals' }

export default async function OwnerWithdrawalsPage() {
  const supabase = await createClient()

  const { data: raw } = await (supabase as any)
    .from('owner_withdrawals')
    .select('id, withdrawal_date, amount, payment_mode, purpose, notes, created_at')
    .order('withdrawal_date', { ascending: false })
    .limit(1000)

  type Withdrawal = {
    id: string; withdrawal_date: string; amount: number; payment_mode: string;
    purpose: string | null; notes: string | null; created_at: string
  }
  const withdrawals = (raw ?? []) as Withdrawal[]

  const totalAll = withdrawals.reduce((s, w) => s + Number(w.amount), 0)

  const now = new Date()
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const totalThisMonth = withdrawals
    .filter(w => w.withdrawal_date.startsWith(monthStr))
    .reduce((s, w) => s + Number(w.amount), 0)

  return (
    <div className="animate-fade-in">
      <Header title="Owner Withdrawals" subtitle="Track funds drawn by the owner outside of salary" />
      <div className="p-6 space-y-5">

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Withdrawals (All Time)</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totalAll)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">This Month</p>
            <p className="text-xl font-bold text-amber-600">{formatCurrency(totalThisMonth)}</p>
          </div>
        </div>

        <WithdrawalsList withdrawals={withdrawals} />
      </div>
    </div>
  )
}
