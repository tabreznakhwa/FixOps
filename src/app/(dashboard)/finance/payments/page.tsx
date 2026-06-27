import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { Plus, CreditCard, CheckCircle2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

export const metadata = { title: 'Payments' }

const MODE_ICONS: Record<string, string> = {
  cash: '💵', bank_transfer: '🏦', card: '💳', pos: '🖥️',
  cheque: '📄', online: '🌐', other: '💰',
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('payments')
    .select('id, payment_number, payment_date, amount_received, payment_mode, reference_number, is_advance, is_cancelled, customers(full_name), invoices(invoice_number)')
    .eq('is_cancelled', false)
    .order('created_at', { ascending: false })

  if (params.mode) query = query.eq('payment_mode', params.mode)

  const { data: paymentsRaw } = await query.limit(50)
  const payments = paymentsRaw as unknown as Array<{
    id: string; payment_number: string; payment_date: string; amount_received: number; payment_mode: string;
    reference_number: string | null; is_advance: boolean; is_cancelled: boolean;
    customers: { full_name: string } | null; invoices: { invoice_number: string } | null
  }>

  // Mode breakdown
  const { data: allPaymentsRaw } = await supabase
    .from('payments')
    .select('payment_mode, amount_received, payment_date')
    .eq('is_cancelled', false)
  const allPayments = allPaymentsRaw as unknown as { payment_mode: string; amount_received: number; payment_date?: string }[]

  const modeBreakdown: Record<string, number> = {}
  allPayments?.forEach((p) => {
    modeBreakdown[p.payment_mode] = (modeBreakdown[p.payment_mode] ?? 0) + p.amount_received
  })

  const totalToday = allPayments
    ?.filter((p) => new Date(p.payment_date ?? '').toDateString() === new Date().toDateString())
    .reduce((s, p) => s + p.amount_received, 0) ?? 0

  const totalMonth = allPayments?.reduce((s, p) => s + p.amount_received, 0) ?? 0

  return (
    <div className="animate-fade-in">
      <Header
        title="Payments"
        subtitle="Payment receipts and collection tracking"
        actions={
          <Link
            href="/finance/payments/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Record Payment
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-5 text-white">
            <p className="text-sm opacity-80 mb-1">Today's Collection</p>
            <p className="text-2xl font-bold">{formatCurrency(totalToday)}</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 md:col-span-2">
            <p className="text-sm font-semibold text-slate-700 mb-3">Collection by Mode</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(modeBreakdown).map(([mode, amount]) => (
                <div key={mode} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50">
                  <span className="text-lg">{MODE_ICONS[mode] ?? '💰'}</span>
                  <div>
                    <p className="text-xs text-slate-500 capitalize">{mode.replace('_', ' ')}</p>
                    <p className="text-sm font-bold text-slate-900">{formatCurrency(amount)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Filter by mode */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Link
            href="/finance/payments"
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${!params.mode ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            All
          </Link>
          {Object.keys(MODE_ICONS).map((mode) => (
            <Link
              key={mode}
              href={`/finance/payments?mode=${mode}`}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors capitalize ${params.mode === mode ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {MODE_ICONS[mode]} {mode.replace('_', ' ')}
            </Link>
          ))}
        </div>

        {/* Payments table */}
        {!payments?.length ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No payments recorded yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Payment</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Customer</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Invoice</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Mode</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Amount</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {payments.map((p) => {
                  const customer = p.customers as { full_name: string } | null
                  const invoice = p.invoices as { invoice_number: string } | null
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <div>
                            <p className="text-sm font-mono font-semibold text-slate-900">{p.payment_number}</p>
                            <p className="text-xs text-slate-400">{formatDate(p.payment_date)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell text-sm text-slate-700">
                        {customer?.full_name}
                      </td>
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        {invoice ? (
                          <span className="text-xs font-mono text-blue-600">{invoice.invoice_number}</span>
                        ) : (
                          p.is_advance && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Advance</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="flex items-center gap-1.5 text-sm text-slate-700 capitalize">
                          {MODE_ICONS[p.payment_mode] ?? '💰'} {p.payment_mode.replace('_', ' ')}
                        </span>
                        {p.reference_number && (
                          <p className="text-xs text-slate-400 mt-0.5">Ref: {p.reference_number}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-sm font-bold text-green-600">+{formatCurrency(p.amount_received)}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/finance/payments/${p.id}`}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
