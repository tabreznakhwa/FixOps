/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthedProfile } from '@/lib/auth/session'
import { getRoleAccess } from '@/lib/orgPermissions'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Package } from 'lucide-react'
import { DocumentLink } from '@/components/ui/DocumentLink'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'
import { currentPath, withReturnTo } from '@/lib/backNav'
import { readPagedRows } from '../vendor-outstanding/reportPaging'

export const metadata = { title: 'Purchase Invoice Register' }

type PurchaseInvoiceRow = {
  id: string
  invoice_number: string
  supplier_invoice_number: string | null
  invoice_date: string
  total_amount: number
  amount_paid: number
  balance_due: number
  payment_status: string
  status: string
  supplier_name: string | null
  suppliers: { id: string; supplier_name: string; supplier_code: string } | null
}

const statusColors: Record<string, string> = {
  confirmed: 'bg-blue-100 text-blue-700',
  received: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
}

export default async function PurchaseRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; supplier?: string }>
}) {
  const params = await searchParams
  const purchaseRegisterPath = currentPath('/suppliers/purchase-register', params)
  const { profile } = await getAuthedProfile()
  if (!profile || profile.status !== 'active' || !profile.organization_id) redirect('/login')
  const financeAccess = await getRoleAccess(profile.organization_id, profile.role)
  if (financeAccess.finance === 'none') redirect('/dashboard?error=unauthorized')

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })
  const firstOfMonth = `${today.slice(0, 7)}-01`
  const from = params.from ?? firstOfMonth
  const to = params.to ?? today
  const admin = createAdminClient() as any
  const failures: string[] = []

  const invoices = await readPagedRows<PurchaseInvoiceRow>(
    (rangeFrom, rangeTo) => {
      let query = admin
        .from('purchase_invoices')
        .select('id, invoice_number, supplier_invoice_number, invoice_date, total_amount, amount_paid, balance_due, payment_status, status, supplier_name, suppliers(id, supplier_name, supplier_code)')
        .eq('organization_id', profile.organization_id)
        .gte('invoice_date', from)
        .lte('invoice_date', to)
      if (params.supplier) query = query.eq('supplier_id', params.supplier)
      return query
        .order('invoice_date', { ascending: false })
        .order('id', { ascending: false })
        .range(rangeFrom, rangeTo)
    },
    failures,
    'purchase invoices',
  )

  const activeInvoices = invoices.filter((invoice) => invoice.status !== 'cancelled')
  const totals = activeInvoices.reduce(
    (acc, invoice) => ({
      total: acc.total + Number(invoice.total_amount ?? 0),
      paid: acc.paid + Number(invoice.amount_paid ?? 0),
      balance: acc.balance + Number(invoice.balance_due ?? 0),
    }),
    { total: 0, paid: 0, balance: 0 },
  )

  const paymentStatusColor: Record<string, string> = {
    unpaid: 'bg-red-100 text-red-700',
    partial: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700',
  }

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Purchase Invoice Register" subtitle={`${formatDate(from)} to ${formatDate(to)}`} />
      </div>
      <Header
        title="Purchase Invoice Register"
        subtitle="Posted supplier invoices and Accounts Payable balances"
        actions={<div className="flex items-center gap-2 print:hidden"><PrintActions /></div>}
      />

      <div className="p-6 space-y-5">
        <form method="get" className="flex items-center gap-3 flex-wrap print:hidden">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <label className="font-medium">From</label>
            <input type="date" name="from" defaultValue={from}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <label className="font-medium">To</label>
            <input type="date" name="to" defaultValue={to}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {params.supplier && <input type="hidden" name="supplier" value={params.supplier} />}
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Apply
          </button>
        </form>

        {failures.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <strong>This register is incomplete.</strong> Could not fully load: {failures.join(', ')}. Totals are not reliable until this is resolved.
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Invoice Purchases', value: totals.total, color: 'text-slate-900' },
            { label: 'Settled', value: totals.paid, color: 'text-green-600' },
            { label: 'Accounts Payable', value: totals.balance, color: 'text-red-600' },
          ].map((summary) => (
            <div key={summary.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wider">{summary.label}</p>
              <p className={`text-lg font-bold ${summary.color}`}>{formatCurrency(summary.value)}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Purchase Invoices</h3>
              <p className="mt-0.5 text-xs text-slate-500">Purchase orders are procurement commitments and are not included in this accounting register.</p>
            </div>
            <span className="text-xs text-slate-500">{invoices.length} records · {formatDate(from)} to {formatDate(to)}</span>
          </div>

          {invoices.length === 0 ? (
            <div className="p-10 text-center">
              <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No purchase invoices in this period</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Invoice #</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Supplier Ref</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Supplier</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Date</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Total</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Settled</th>
                    <th className="text-right text-xs font-semibold text-red-600 uppercase tracking-wider px-5 py-3">Payable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {invoices.map((invoice) => {
                    const isCancelled = invoice.status === 'cancelled'
                    return (
                      <tr key={invoice.id} className={`hover:bg-slate-50 transition-colors ${isCancelled ? 'opacity-50' : ''}`}>
                        <td className="px-5 py-3">
                          <DocumentLink href={withReturnTo(`/inventory/purchase-invoices/${invoice.id}`, purchaseRegisterPath)} tabLabel={invoice.invoice_number} className="text-sm font-mono text-blue-600 hover:text-blue-700 font-semibold">
                            {invoice.invoice_number}
                          </DocumentLink>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-slate-600">{invoice.supplier_invoice_number ?? '—'}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800">{invoice.suppliers?.supplier_name ?? invoice.supplier_name ?? '—'}</p>
                          {invoice.suppliers?.supplier_code && <p className="text-xs text-slate-400 font-mono">{invoice.suppliers.supplier_code}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{formatDate(invoice.invoice_date)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${statusColors[invoice.status] ?? 'bg-slate-100 text-slate-600'}`}>
                            {invoice.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">{formatCurrency(invoice.total_amount)}</td>
                        <td className="px-4 py-3 text-right text-sm text-green-700">{formatCurrency(invoice.amount_paid)}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${paymentStatusColor[invoice.payment_status] ?? 'bg-slate-100 text-slate-600'}`}>
                            {formatCurrency(invoice.balance_due)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={5} className="px-5 py-3 text-sm font-bold text-slate-700">Active Invoice Total</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">{formatCurrency(totals.total)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-700">{formatCurrency(totals.paid)}</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(totals.balance)}</td>
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
