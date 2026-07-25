import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Banknote, Plus } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'Supplier Advances' }

const MODE_LABELS: Record<string, string> = {
  cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque',
  online: 'Online', card: 'Card', other: 'Other',
}

const MODE_COLORS: Record<string, string> = {
  cash: 'bg-green-100 text-green-700',
  bank_transfer: 'bg-blue-100 text-blue-700',
  cheque: 'bg-purple-100 text-purple-700',
  online: 'bg-cyan-100 text-cyan-700',
  card: 'bg-indigo-100 text-indigo-700',
  other: 'bg-slate-100 text-slate-600',
}

export default async function SupplierAdvancesPage() {
  const admin = createAdminClient() as any

  const { data: advancesRaw } = await admin
    .from('supplier_advances')
    .select('id, advance_number, advance_date, amount, amount_utilized, balance, payment_mode, reference_number, is_cancelled, suppliers(supplier_name, supplier_code)')
    .order('advance_date', { ascending: false })
    .limit(500)

  const advances = (advancesRaw ?? []) as Array<{
    id: string
    advance_number: string
    advance_date: string
    amount: number
    amount_utilized: number
    balance: number
    payment_mode: string
    reference_number: string | null
    is_cancelled: boolean
    suppliers: { supplier_name: string; supplier_code: string } | null
  }>

  const active = advances.filter((a) => !a.is_cancelled)
  const totalAmount = active.reduce((s, a) => s + Number(a.amount), 0)
  const totalBalance = active.reduce((s, a) => s + Number(a.balance), 0)
  const totalUtilized = active.reduce((s, a) => s + Number(a.amount_utilized), 0)

  return (
    <div className="animate-fade-in">
      <Header
        title="Supplier Advances"
        subtitle="Advance payments made to suppliers before goods are received"
        actions={
          <div className="flex items-center gap-2">
            <RefreshButton />
            <Link
              href="/suppliers/advances/new"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> New Advance
            </Link>
          </div>
        }
      />

      <div className="p-6 space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Total Advances</p>
            <p className="text-2xl font-bold text-slate-800">{formatCurrency(totalAmount)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{active.length} active advance{active.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Utilized</p>
            <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalUtilized)}</p>
            <p className="text-xs text-slate-400 mt-0.5">Applied to invoices</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Available Balance</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalBalance)}</p>
            <p className="text-xs text-slate-400 mt-0.5">Ready to apply</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">All Advances</h3>
          </div>

          {advances.length === 0 ? (
            <div className="p-10 text-center">
              <Banknote className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No supplier advances recorded yet</p>
              <Link
                href="/suppliers/advances/new"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-3.5 h-3.5" /> Record First Advance
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Advance #</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Supplier</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Date</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Mode</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Amount</th>
                    <th className="text-right text-xs font-semibold text-amber-600 uppercase tracking-wider px-4 py-3">Utilized</th>
                    <th className="text-right text-xs font-semibold text-green-600 uppercase tracking-wider px-5 py-3">Balance</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {advances.map((adv) => (
                    <tr key={adv.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 text-sm font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {adv.advance_number}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">{adv.suppliers?.supplier_name ?? '—'}</p>
                        {adv.suppliers?.supplier_code && (
                          <p className="text-xs text-slate-400 font-mono">{adv.suppliers.supplier_code}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                        {formatDate(adv.advance_date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${MODE_COLORS[adv.payment_mode] ?? 'bg-slate-100 text-slate-600'}`}>
                          {MODE_LABELS[adv.payment_mode] ?? adv.payment_mode}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-800">
                        {formatCurrency(adv.amount)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-amber-600">
                        {Number(adv.amount_utilized) > 0 ? formatCurrency(adv.amount_utilized) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-bold text-green-600">
                        {formatCurrency(adv.balance)}
                      </td>
                      <td className="px-4 py-3">
                        {adv.is_cancelled ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Cancelled</span>
                        ) : Number(adv.balance) <= 0 ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Fully Used</span>
                        ) : (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Available</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
