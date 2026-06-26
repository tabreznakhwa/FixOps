import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, FileText, Plus, Edit } from 'lucide-react'
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils'

export const metadata = { title: 'Supplier' }

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: supplierRaw } = await (supabase as any)
    .from('suppliers')
    .select('id, supplier_code, supplier_name, contact_person, mobile_number, email, city, address, payment_terms, status, notes')
    .eq('id', id)
    .single()

  if (!supplierRaw) notFound()

  const supplier = supplierRaw as {
    id: string
    supplier_code: string
    supplier_name: string
    contact_person: string | null
    mobile_number: string | null
    email: string | null
    city: string | null
    address: string | null
    payment_terms: number
    status: string
    notes: string | null
  }

  const { data: posRaw } = await (supabase as any)
    .from('purchase_orders')
    .select('id, po_number, purchase_date, status, total_amount, amount_paid, balance_due, payment_status')
    .eq('supplier_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  const pos = (posRaw ?? []) as Array<{
    id: string
    po_number: string
    purchase_date: string
    status: string
    total_amount: number
    amount_paid: number
    balance_due: number
    payment_status: string
  }>

  const totalOwed = pos.reduce((s, p) => s + p.balance_due, 0)

  return (
    <div className="animate-fade-in">
      <Header
        title={supplier.supplier_name}
        subtitle={supplier.supplier_code}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/suppliers/po/new?supplier_id=${supplier.id}`}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Create PO
            </Link>
            <Link
              href={`/suppliers/${supplier.id}/edit`}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
            >
              <Edit className="w-4 h-4" /> Edit
            </Link>
            <Link
              href="/suppliers"
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
          </div>
        }
      />

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Supplier Info */}
          <div className="lg:col-span-1 space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">{supplier.supplier_name}</p>
                  <p className="text-xs font-mono text-slate-400">{supplier.supplier_code}</p>
                </div>
              </div>

              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(supplier.status)}`}>
                {supplier.status}
              </span>

              <div className="mt-4 space-y-3">
                {supplier.contact_person && (
                  <div>
                    <p className="text-xs text-slate-400">Contact Person</p>
                    <p className="text-sm font-semibold text-slate-900">{supplier.contact_person}</p>
                  </div>
                )}
                {supplier.mobile_number && (
                  <div>
                    <p className="text-xs text-slate-400">Mobile</p>
                    <p className="text-sm font-semibold text-slate-900">{supplier.mobile_number}</p>
                  </div>
                )}
                {supplier.email && (
                  <div>
                    <p className="text-xs text-slate-400">Email</p>
                    <p className="text-sm font-semibold text-slate-900">{supplier.email}</p>
                  </div>
                )}
                {supplier.city && (
                  <div>
                    <p className="text-xs text-slate-400">City</p>
                    <p className="text-sm font-semibold text-slate-900">{supplier.city}</p>
                  </div>
                )}
                {supplier.address && (
                  <div>
                    <p className="text-xs text-slate-400">Address</p>
                    <p className="text-sm text-slate-700">{supplier.address}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-400">Payment Terms</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {supplier.payment_terms === 0 ? 'Due on Receipt' : `Net ${supplier.payment_terms}`}
                  </p>
                </div>
              </div>

              {supplier.notes && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-400 mb-1">Notes</p>
                  <p className="text-sm text-slate-700 whitespace-pre-line">{supplier.notes}</p>
                </div>
              )}
            </div>

            {/* Balance owed */}
            <div className={`rounded-xl border p-5 ${totalOwed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Balance Owed</p>
              <p className={`text-2xl font-bold ${totalOwed > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                {formatCurrency(totalOwed)}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">across {pos.length} purchase orders</p>
            </div>
          </div>

          {/* Purchase Orders */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <h3 className="font-semibold text-slate-900">Purchase Orders</h3>
                </div>
                <Link
                  href={`/suppliers/po/new?supplier_id=${supplier.id}`}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  + New PO
                </Link>
              </div>

              {pos.length === 0 ? (
                <div className="p-10 text-center">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No purchase orders yet</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">PO #</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Date</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Total</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Balance</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pos.map((po) => (
                      <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3.5 text-sm font-mono font-semibold text-slate-900">{po.po_number}</td>
                        <td className="px-4 py-3.5 text-sm text-slate-600 hidden md:table-cell">{formatDate(po.purchase_date)}</td>
                        <td className="px-4 py-3.5 text-right text-sm font-bold text-slate-900">{formatCurrency(po.total_amount)}</td>
                        <td className="px-4 py-3.5 text-right text-sm font-bold text-amber-600">{formatCurrency(po.balance_due)}</td>
                        <td className="px-4 py-3.5">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getStatusColor(po.status)}`}>
                            {po.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
