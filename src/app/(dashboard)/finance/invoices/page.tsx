import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { Plus, FileText, TrendingUp, Clock, AlertCircle, CheckCircle2 } from 'lucide-react'
import { formatCurrency, formatDate, getStatusColor, formatStatus } from '@/lib/utils'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'

export const metadata = { title: 'Invoices' }

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; from?: string; to?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()
  const hasDateFilter = Boolean(params.from || params.to)

  let query = supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, due_date, total_amount, amount_paid, balance_due, status, invoice_type, customers(full_name, mobile_number)')
    .order('created_at', { ascending: false })

  if (params.status) query = query.eq('status', params.status)
  if (params.q) query = query.ilike('invoice_number', `%${params.q}%`)
  if (params.from) query = query.gte('invoice_date', params.from)
  if (params.to) query = query.lte('invoice_date', params.to)

  const { data: invoicesRaw } = await query.limit(hasDateFilter ? 1000 : 50)
  const invoices = invoicesRaw as unknown as Array<{
    id: string; invoice_number: string; invoice_date: string; due_date: string | null;
    total_amount: number; amount_paid: number; balance_due: number; status: string;
    invoice_type: string; customers: { full_name: string; mobile_number: string } | null
  }>

  // Summary stats
  const { data: allInvoicesRaw } = await supabase
    .from('invoices')
    .select('total_amount, amount_paid, balance_due, status')
    .not('status', 'in', '(cancelled,written_off)')
  const allInvoices = allInvoicesRaw as unknown as { total_amount: number; amount_paid: number; balance_due: number; status: string }[]

  const totalInvoiced = allInvoices?.reduce((s, i) => s + i.total_amount, 0) ?? 0
  const totalCollected = allInvoices?.reduce((s, i) => s + i.amount_paid, 0) ?? 0
  const totalPending = allInvoices?.reduce((s, i) => s + i.balance_due, 0) ?? 0
  const overdueCount = allInvoices?.filter((i) => i.status === 'overdue').length ?? 0

  const statusIcons: Record<string, React.ReactNode> = {
    paid: <CheckCircle2 className="w-3.5 h-3.5" />,
    overdue: <AlertCircle className="w-3.5 h-3.5" />,
    partial: <Clock className="w-3.5 h-3.5" />,
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Invoices"
        subtitle="Billing and revenue tracking"
        actions={
          <Link
            href="/finance/invoices/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Invoice
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Invoiced', value: formatCurrency(totalInvoiced), icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Total Collected', value: formatCurrency(totalCollected), icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Outstanding', value: formatCurrency(totalPending), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Overdue Invoices', value: overdueCount, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Status Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { label: 'All', value: '' },
            { label: 'Draft', value: 'draft' },
            { label: 'Issued', value: 'issued' },
            { label: 'Partial', value: 'partial' },
            { label: 'Overdue', value: 'overdue' },
            { label: 'Paid', value: 'paid' },
            { label: 'Cancelled', value: 'cancelled' },
          ].map(({ label, value }) => {
            const qs = [value ? `status=${value}` : '', params.from ? `from=${params.from}` : '', params.to ? `to=${params.to}` : '']
              .filter(Boolean).join('&')
            return (
              <Link
                key={label}
                href={qs ? `/finance/invoices?${qs}` : '/finance/invoices'}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  params.status === value || (!params.status && !value) ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>

        {/* Date Filter */}
        <DateRangeFilter basePath="/finance/invoices" from={params.from} to={params.to} />

        {/* Invoice Table */}
        {!invoices?.length ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No invoices found</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Invoice</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Customer</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Date</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Due Date</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Amount</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Balance</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {invoices.map((inv) => {
                  const customer = inv.customers as { full_name: string } | null
                  const isOverdue = inv.status === 'overdue'
                  return (
                    <tr key={inv.id} className={`hover:bg-slate-50 transition-colors group ${isOverdue ? 'bg-red-50/30' : ''}`}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-400" />
                          <div>
                            <p className="text-sm font-mono font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                              {inv.invoice_number}
                            </p>
                            <p className="text-xs text-slate-400 capitalize">{inv.invoice_type}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell text-sm text-slate-700">
                        {customer?.full_name}
                      </td>
                      <td className="px-4 py-3.5 hidden lg:table-cell text-sm text-slate-600">
                        {formatDate(inv.invoice_date)}
                      </td>
                      <td className={`px-4 py-3.5 hidden lg:table-cell text-sm ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                        {inv.due_date ? formatDate(inv.due_date) : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <p className="text-sm font-bold text-slate-900">{formatCurrency(inv.total_amount)}</p>
                        {inv.amount_paid > 0 && (
                          <p className="text-xs text-green-600">+{formatCurrency(inv.amount_paid)} paid</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <p className={`text-sm font-bold ${inv.balance_due > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                          {formatCurrency(inv.balance_due)}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(inv.status)}`}>
                          {statusIcons[inv.status]}
                          {formatStatus(inv.status)}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/finance/invoices/${inv.id}`}
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
