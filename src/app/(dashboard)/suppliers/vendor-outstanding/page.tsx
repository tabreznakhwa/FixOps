import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'

export const metadata = { title: 'Vendor Bill-wise Outstanding' }

export default async function VendorOutstandingPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await (supabase as any).from('users').select('organization_id').eq('id', user!.id).single()
  const orgId = (profileRaw as { organization_id: string } | null)?.organization_id

  const admin = createAdminClient() as any

  let poQuery = admin
    .from('purchase_orders')
    .select('id, po_number, purchase_date, due_date, total_amount, amount_paid, balance_due, payment_status, status, suppliers(id, supplier_name, supplier_code)')
    .eq('organization_id', orgId)
    .gt('balance_due', 0)
    .not('status', 'in', '(cancelled)')
    .not('payment_status', 'eq', 'paid')
    .order('purchase_date', { ascending: true })

  if (params.supplier) poQuery = poQuery.eq('supplier_id', params.supplier)

  let piQuery = admin
    .from('purchase_invoices')
    .select('id, invoice_number, invoice_date, due_date, total_amount, amount_paid, balance_due, payment_status, supplier_id, supplier_name')
    .eq('organization_id', orgId)
    .gt('balance_due', 0)
    .not('status', 'eq', 'cancelled')
    .not('payment_status', 'eq', 'paid')
    .order('invoice_date', { ascending: true })

  if (params.supplier) piQuery = piQuery.eq('supplier_id', params.supplier)

  let openingQuery = admin
    .from('opening_payables')
    .select('id, bill_ref, bill_date, due_date, amount, balance_due, suppliers(id, supplier_name, supplier_code)')
    .eq('organization_id', orgId)
    .gt('balance_due', 0)
    .order('bill_date', { ascending: true })

  if (params.supplier) openingQuery = openingQuery.eq('supplier_id', params.supplier)

  const [{ data: posRaw }, { data: pisRaw }, { data: openingRaw }] = await Promise.all([
    poQuery.limit(200),
    piQuery.limit(200),
    openingQuery.limit(200),
  ])

  const pos = (posRaw ?? []) as Array<{
    id: string; po_number: string; purchase_date: string; due_date: string | null
    total_amount: number; amount_paid: number; balance_due: number
    payment_status: string; status: string
    suppliers: { id: string; supplier_name: string; supplier_code: string } | null
  }>

  const pis = (pisRaw ?? []) as Array<{
    id: string; invoice_number: string; invoice_date: string; due_date: string | null
    total_amount: number; amount_paid: number; balance_due: number
    payment_status: string; supplier_id: string | null; supplier_name: string | null
  }>

  const openingEntries = (openingRaw ?? []) as Array<{
    id: string; bill_ref: string; bill_date: string; due_date: string | null
    amount: number; balance_due: number
    suppliers: { id: string; supplier_name: string; supplier_code: string } | null
  }>

  const totalOutstanding = pos.reduce((s, p) => s + p.balance_due, 0)
    + pis.reduce((s, p) => s + p.balance_due, 0)
    + openingEntries.reduce((s, e) => s + e.balance_due, 0)

  const today = new Date()
  const allForAgeing = [
    ...pos.map(p => ({ balance_due: p.balance_due, due_date: p.due_date })),
    ...pis.map(p => ({ balance_due: p.balance_due, due_date: p.due_date })),
    ...openingEntries.map(e => ({ balance_due: e.balance_due, due_date: e.due_date })),
  ]
  const ageing = allForAgeing.reduce(
    (acc, item) => {
      if (!item.due_date) { acc.current += item.balance_due; return acc }
      const days = Math.floor((today.getTime() - new Date(item.due_date).getTime()) / 86400000)
      if (days <= 0) acc.current += item.balance_due
      else if (days <= 30) acc.d30 += item.balance_due
      else if (days <= 60) acc.d60 += item.balance_due
      else if (days <= 90) acc.d90 += item.balance_due
      else acc.d90plus += item.balance_due
      return acc
    },
    { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 }
  )

  const pStatusColor: Record<string, string> = {
    unpaid: 'bg-red-100 text-red-700',
    partial: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700',
  }

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title="Vendor Bill-wise Outstanding" subtitle={`As of ${new Date().toLocaleDateString('en-GB')}`} />
      </div>
      <Header title="Vendor Bill-wise Outstanding" subtitle="Supplier bills with pending balances"
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Link href="/suppliers/opening-payables" className="px-3 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors">
              Opening Payables
            </Link>
            <PrintActions />
          </div>
        }
      />

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
              Outstanding Bills
              <span className="ml-2 text-sm font-normal text-slate-500">({pos.length + pis.length + openingEntries.length})</span>
            </h3>
            <p className="text-sm font-bold text-red-600">Total: {formatCurrency(totalOutstanding)}</p>
          </div>

          {pos.length === 0 && pis.length === 0 && openingEntries.length === 0 ? (
            <div className="p-10 text-center">
              <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No outstanding supplier bills</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Bill / PO #</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Supplier</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Date</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Due Date</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Total</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Paid</th>
                    <th className="text-right text-xs font-semibold text-red-600 uppercase tracking-wider px-5 py-3">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {openingEntries.map((entry) => {
                    const isOverdue = entry.due_date && new Date(entry.due_date) < today
                    return (
                      <tr key={`op-${entry.id}`} className="bg-amber-50/40 hover:bg-amber-50 transition-colors">
                        <td className="px-5 py-3 text-sm font-mono text-amber-700 font-semibold">{entry.bill_ref}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800">{entry.suppliers?.supplier_name}</p>
                          <p className="text-xs text-slate-400">{entry.suppliers?.supplier_code}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{formatDate(entry.bill_date)}</td>
                        <td className={`px-4 py-3 text-sm ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                          {entry.due_date ? formatDate(entry.due_date) : '—'}
                          {isOverdue && <span className="ml-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Overdue</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Opening Bal</span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700">{formatCurrency(entry.amount)}</td>
                        <td className="px-4 py-3 text-right text-sm text-green-700">—</td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(entry.balance_due)}</td>
                      </tr>
                    )
                  })}
                  {pis.map((pi) => {
                    const isOverdue = pi.due_date && new Date(pi.due_date) < today
                    return (
                      <tr key={`pi-${pi.id}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3">
                          <Link href={`/inventory/purchase-invoices/${pi.id}`} className="text-sm font-mono text-blue-600 hover:text-blue-700 font-semibold">
                            {pi.invoice_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800">{pi.supplier_name ?? '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{formatDate(pi.invoice_date)}</td>
                        <td className={`px-4 py-3 text-sm ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                          {pi.due_date ? formatDate(pi.due_date) : '—'}
                          {isOverdue && <span className="ml-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Overdue</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${pStatusColor[pi.payment_status] ?? 'bg-slate-100 text-slate-600'}`}>
                            {pi.payment_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700">{formatCurrency(pi.total_amount)}</td>
                        <td className="px-4 py-3 text-right text-sm text-green-700">{formatCurrency(pi.amount_paid)}</td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(pi.balance_due)}</td>
                      </tr>
                    )
                  })}
                  {pos.map((po) => {
                    const isOverdue = po.due_date && new Date(po.due_date) < today
                    return (
                      <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3">
                          <Link href={`/suppliers/po/${po.id}`} className="text-sm font-mono text-blue-600 hover:text-blue-700 font-semibold">
                            {po.po_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800">{po.suppliers?.supplier_name}</p>
                          <p className="text-xs text-slate-400">{po.suppliers?.supplier_code}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{formatDate(po.purchase_date)}</td>
                        <td className={`px-4 py-3 text-sm ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                          {po.due_date ? formatDate(po.due_date) : '—'}
                          {isOverdue && <span className="ml-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Overdue</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${pStatusColor[po.payment_status] ?? 'bg-slate-100 text-slate-600'}`}>
                            {po.payment_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700">{formatCurrency(po.total_amount)}</td>
                        <td className="px-4 py-3 text-right text-sm text-green-700">{formatCurrency(po.amount_paid)}</td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-red-600">{formatCurrency(po.balance_due)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={5} className="px-5 py-3 text-sm font-bold text-slate-700">Total</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">
                      {formatCurrency(
                        pos.reduce((s, p) => s + p.total_amount, 0)
                        + pis.reduce((s, p) => s + p.total_amount, 0)
                        + openingEntries.reduce((s, e) => s + e.amount, 0)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-700">
                      {formatCurrency(
                        pos.reduce((s, p) => s + p.amount_paid, 0)
                        + pis.reduce((s, p) => s + p.amount_paid, 0)
                      )}
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
