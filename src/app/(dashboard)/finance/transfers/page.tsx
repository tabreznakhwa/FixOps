import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeftRight } from 'lucide-react'
import { FundTransfersList } from './FundTransfersList'

export const metadata = { title: 'Fund Transfers' }

export default async function FundTransfersPage() {
  const supabase = await createClient()

  const { data: raw } = await (supabase as any)
    .from('fund_transfers')
    .select('id, transfer_date, from_account, to_account, amount, reference_number, notes, created_at')
    .order('transfer_date', { ascending: false })
    .limit(1000)

  type Transfer = {
    id: string; transfer_date: string; from_account: string; to_account: string;
    amount: number; reference_number: string | null; notes: string | null; created_at: string
  }
  const transfers = (raw ?? []) as Transfer[]

  const cashToBank = transfers.filter(t => t.from_account === 'cash').reduce((s, t) => s + Number(t.amount), 0)
  const bankToCash = transfers.filter(t => t.from_account === 'bank').reduce((s, t) => s + Number(t.amount), 0)

  return (
    <div className="animate-fade-in">
      <Header title="Fund Transfers" subtitle="Cash ↔ Bank internal transfers" />
      <div className="p-6 space-y-5">

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Cash → Bank (All Time)</p>
            <p className="text-xl font-bold text-blue-600">{formatCurrency(cashToBank)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Bank → Cash (All Time)</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(bankToCash)}</p>
          </div>
        </div>

        <FundTransfersList transfers={transfers} />
      </div>
    </div>
  )
}
