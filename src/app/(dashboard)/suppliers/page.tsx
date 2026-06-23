import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { Plus, Building2, FileText, DollarSign } from 'lucide-react'
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils'

export const metadata = { title: 'Suppliers & Purchase Orders' }

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams
  const tab = params.tab ?? 'suppliers'
  const supabase = await createClient()

  const { data: suppliersRaw } = await supabase
    .from('suppliers')
    .select('id, supplier_code, supplier_name, contact_person, mobile_number, city, payment_terms, status')
    .order('supplier_name')
  const suppliers = suppliersRaw as unknown as Array<{
    id: string; supplier_code: string; supplier_name: string; contact_person: string | null;
    mobile_number: string | null; city: string | null; payment_terms: number; status: string
  }>

  const { data: purchaseOrdersRaw } = await supabase
    .from('purchase_orders')
    .select('id, po_number, purchase_date, status, total_amount, amount_paid, balance_due, payment_status, suppliers(supplier_name)')
    .order('created_at', { ascending: false })
    .limit(30)
  const purchaseOrders = purchaseOrdersRaw as unknown as Array<{
    id: string; po_number: string; purchase_date: string; status: string;
    total_amount: number; amount_paid: number; balance_due: number; payment_status: string;
    suppliers: { supplier_name: string } | null
  }>

  const totalPayable = purchaseOrders?.reduce((s, p) => s + p.balance_due, 0) ?? 0

  return (
    <div className="animate-fade-in">
      <Header
        title="Suppliers & Purchase Orders"
        subtitle="Manage suppliers and procurement"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/suppliers/new" className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors">
              <Plus className="w-4 h-4" /> Add Supplier
            </Link>
            <Link href="/suppliers/po/new" className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="w-4 h-4" /> Create PO
            </Link>
          </div>
        }
      />

      <div className="p-6 space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <Building2 className="w-5 h-5 text-blue-600 mb-2" />
            <p className="text-2xl font-bold text-slate-900">{suppliers?.length ?? 0}</p>
            <p className="text-xs text-slate-500">Active Suppliers</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <FileText className="w-5 h-5 text-purple-600 mb-2" />
            <p className="text-2xl font-bold text-slate-900">{purchaseOrders?.length ?? 0}</p>
            <p className="text-xs text-slate-500">Purchase Orders</p>
          </div>
          <div className="bg-white rounded-xl border border-amber-200 p-4 col-span-2 md:col-span-1">
            <DollarSign className="w-5 h-5 text-amber-600 mb-2" />
            <p className="text-xl font-bold text-amber-600">{formatCurrency(totalPayable)}</p>
            <p className="text-xs text-slate-500">Total Payable</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200">
          {[{ key: 'suppliers', label: 'Suppliers' }, { key: 'po', label: 'Purchase Orders' }].map(({ key, label }) => (
            <Link
              key={key}
              href={`/suppliers?tab=${key}`}
              className={`px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Suppliers Table */}
        {tab === 'suppliers' && (
          !suppliers?.length ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No suppliers yet</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Supplier</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Contact</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">City</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {suppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">{s.supplier_name}</p>
                        <p className="text-xs font-mono text-slate-400">{s.supplier_code}</p>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell text-sm text-slate-600">
                        <p>{s.contact_person}</p>
                        <p className="text-xs text-slate-400">{s.mobile_number}</p>
                      </td>
                      <td className="px-4 py-3.5 hidden lg:table-cell text-sm text-slate-600">{s.city}</td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getStatusColor(s.status)}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link href={`/suppliers/${s.id}`} className="text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">View →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Purchase Orders */}
        {tab === 'po' && (
          !purchaseOrders?.length ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No purchase orders yet</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">PO Number</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Supplier</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Date</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Total</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Balance</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {purchaseOrders.map((po) => {
                    const supplier = po.suppliers as { supplier_name: string } | null
                    return (
                      <tr key={po.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-5 py-3.5 text-sm font-mono font-semibold text-slate-900 group-hover:text-blue-700">{po.po_number}</td>
                        <td className="px-4 py-3.5 hidden md:table-cell text-sm text-slate-700">{supplier?.supplier_name}</td>
                        <td className="px-4 py-3.5 hidden lg:table-cell text-sm text-slate-600">{formatDate(po.purchase_date)}</td>
                        <td className="px-4 py-3.5 text-right text-sm font-bold text-slate-900">{formatCurrency(po.total_amount)}</td>
                        <td className="px-4 py-3.5 text-right text-sm font-bold text-amber-600">{formatCurrency(po.balance_due)}</td>
                        <td className="px-4 py-3.5">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getStatusColor(po.status)}`}>{po.status}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <Link href={`/suppliers/po/${po.id}`} className="text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">View →</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  )
}
