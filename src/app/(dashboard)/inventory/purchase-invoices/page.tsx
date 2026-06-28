import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { Plus, Package } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'

export const metadata = { title: 'Purchase Invoices' }

export default async function PurchaseInvoicesPage() {
  const supabase = await createClient()
  const admin = createAdminClient() as any

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await admin.from('users').select('organization_id').eq('id', user!.id).single()
  const orgId = (profileRaw as { organization_id: string } | null)?.organization_id

  const { data: invoicesRaw } = await admin
    .from('purchase_invoices')
    .select('id, invoice_number, invoice_date, supplier_name, payment_type, payment_status, total_amount, balance_due, status, suppliers(supplier_name)')
    .eq('organization_id', orgId)
    .order('invoice_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  const invoices = (invoicesRaw ?? []) as Array<{
    id: string; invoice_number: string; invoice_date: string
    supplier_name: string | null; payment_type: string; payment_status: string
    total_amount: number; balance_due: number; status: string
    suppliers: { supplier_name: string } | null
  }>

  // Summary totals
  const totalPurchases = invoices.filter(i => i.status !== 'cancelled').reduce((s, i) => s + i.total_amount, 0)
  const totalUnpaid = invoices.filter(i => i.status !== 'cancelled').reduce((s, i) => s + i.balance_due, 0)

  return (
    <div className="animate-fade-in">
      <Header
        title="Purchase Invoices"
        subtitle="Record purchases and update inventory"
        actions={
          <Link href="/inventory/purchase-invoices/new"
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition">
            <Plus className="w-4 h-4" /> New Purchase Invoice
          </Link>
        }
      />

      <div className="p-6 space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Purchases</p>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(totalPurchases)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Balance Payable</p>
            <p className={`text-xl font-bold ${totalUnpaid > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(totalUnpaid)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Invoices</p>
            <p className="text-xl font-bold text-slate-900">{invoices.filter(i => i.status !== 'cancelled').length}</p>
          </div>
        </div>

        {/* Table */}
        {invoices.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No purchase invoices yet</p>
            <Link href="/inventory/purchase-invoices/new"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition">
              <Plus className="w-4 h-4" /> Record First Purchase
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Invoice #</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Date</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Supplier</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Type</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Total</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Balance</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {invoices.map(inv => {
                  const supplierDisplay = inv.suppliers?.supplier_name ?? inv.supplier_name ?? '—'
                  const isCash = inv.payment_type === 'cash'
                  return (
                    <tr key={inv.id} className={`hover:bg-slate-50 transition-colors ${inv.status === 'cancelled' ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3.5">
                        <Link href={`/inventory/purchase-invoices/${inv.id}`}
                          className="text-sm font-mono font-semibold text-blue-600 hover:text-blue-800">
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">{formatDate(inv.invoice_date)}</td>
                      <td className="px-4 py-3.5 text-sm text-slate-700 hidden md:table-cell">{supplierDisplay}</td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isCash ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {isCash ? 'Cash' : 'Credit'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-slate-900 text-right">{formatCurrency(inv.total_amount)}</td>
                      <td className="px-4 py-3.5 text-right hidden md:table-cell">
                        <span className={`text-sm font-semibold ${inv.balance_due > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(inv.balance_due)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {inv.status === 'cancelled' ? (
                          <span className="text-xs font-semibold text-red-500 bg-red-50 px-2.5 py-1 rounded-full">Cancelled</span>
                        ) : (
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${inv.payment_status === 'paid' ? 'bg-green-100 text-green-700' : inv.payment_status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                            {inv.payment_status.charAt(0).toUpperCase() + inv.payment_status.slice(1)}
                          </span>
                        )}
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
