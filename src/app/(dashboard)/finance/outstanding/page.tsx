import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'

export const metadata = { title: 'Bill-wise Outstanding' }

export default async function OutstandingPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  let query = (supabase as any)
    .from('invoices')
    .select('id, invoice_number, invoice_date, due_date, total_amount, amount_paid, balance_due, status, customers(id, full_name, company_name, customer_code, mobile_number)')
    .gt('balance_due', 0)
    .not('status', 'in', '(cancelled,written_off,paid)')
    .order('due_date', { ascending: true })

  if (params.customer) query = query.eq('customer_id', params.customer)

  const { data: invoicesRaw } = await query.limit(200)
  const invoices = (invoicesRaw ?? []) as Array<{
    id: string; invoice_number: string; invoice_date: string; due_date: string | null
    total_amount: number; amount_paid: number; balance_due: number; status: string
    customers: { id: string; full_name: string; company_name: string | null; customer_code: string; mobile_number: string } | null
  }>

  const totalOutstanding = invoices.reduce((s, i) => s + i.balance_due, 0)

  // Ageing buckets
  const today = new Date()
  const ageing = invoices.reduce(
    (acc, inv) => {
      if (!inv.due_date) { acc.current += inv.balance_due; return acc }
      const days = Math.floor((today.getTime() - new Date(inv.due_date).getTime()) / 86400000)
      if (days <= 0) acc.current += inv.balance_due
      else if (days <= 30) acc.d30 += inv.balance_due
      else if (days <= 60) acc.d60 += inv.balance_due
      else if (days <= 90) acc.d90 += inv.balance_due
      else acc.d90plus += inv.balance_due
      return acc
    },
    { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 }
  )

  const statusColor: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600', issued: 'bg-blue-100 text-blue-700',
    partial: 'bg-amber-100 text-amber-700', overdue: 'bg-red-100 text-red-700',
  }

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Bill-wise Outstanding" subtitle={`As of ${new Date().toLocaleDateString('en-GB')}`} />
      </div>
      <Header title="Bill-wise Outstanding" subtitle="Customer invoices with pending balances"
        actions={<PrintActions />} />

      <div className="p-6 space-y-5">
        {/* Ageing summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Not Due', value: ageing.current, color: 'text-green-600' },
            { label: '1–30 Days', value: ageing.d30, color: 'text-amber-600' },
            { label: '31–60 Days', value: ageing.d60, color: 'text-orange-600' },
            { label: '61–90 Days', value: ageing.d90, color: 'text-red-600' },
            { label: '90+ Days', value: ageing.d90plus, color: 'text-red-800' },
          ].map((b) => (
            <div key={b.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-xs text-slate-500 font-medium mb-1">{b.label}</p>
              <p className={`text-base font-bold ${b.color}`}>{formatCurrency(b.value)}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">
              Outstanding Invoices
              <span className="ml-2 text-sm font-normal text-slate-500">({invoices.length})</span>
            </h3>
            <p className="text-sm font-bold text-red-600">Total: {formatCurrency(totalOutstanding)}</p>
          </div>

          {invoices.length === 0 ? (
            <div className="p-10 text-center">
              <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No outstanding invoices</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Invoice #</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Customer</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Invoice Date</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Due Date</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Invoice Amt</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Paid</th>
                    <th className="text-right text-xs font-semibold text-red-600 uppercase tracking-wider px-5 py-3">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {invoices.map((inv) => {
                    const isOverdue = inv.due_date && new Date(inv.due_date) < today && inv.status !== 'paid'
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3">
                          <Link href={`/finance/invoices/${inv.id}`} className="text-sm font-mono text-blue-600 hover:text-blue-700 font-semibold">
                            {inv.invoice_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800">{inv.customers?.full_name}</p>
                          {inv.customers?.company_name && <p className="text-xs text-slate-400">{inv.customers.company_name}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{formatDate(inv.invoice_date)}</td>
                        <td className={`px-4 py-3 text-sm ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                          {inv.due_date ? formatDate(inv.due_date) : '—'}
                          {isOverdue && <span className="ml-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Overdue</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${statusColor[inv.status] ?? 'bg-slate-100 text-slate-600'}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700">{formatCurrency(inv.total_amount)}</td>
                        <td className="px-4 py-3 text-right text-sm text-green-700">{formatCurrency(inv.amount_paid)}</td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(inv.balance_due)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={5} className="px-5 py-3 text-sm font-bold text-slate-700">Total</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">
                      {formatCurrency(invoices.reduce((s, i) => s + i.total_amount, 0))}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-700">
                      {formatCurrency(invoices.reduce((s, i) => s + i.amount_paid, 0))}
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(totalOutstanding)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
