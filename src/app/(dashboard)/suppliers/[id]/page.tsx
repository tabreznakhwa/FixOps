/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { DocumentLink } from '@/components/ui/DocumentLink'
import { Building2, FileText, Plus, Edit } from 'lucide-react'
import { BackButton } from '@/components/ui/BackButton'
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils'
import { currentPath, resolveBack, withReturnTo } from '@/lib/backNav'

export const metadata = { title: 'Supplier' }

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ return_to?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const supplierPath = currentPath(`/suppliers/${id}`, query)
  const back = resolveBack(query.return_to, '/suppliers', 'Suppliers')
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
    .select('id, po_number, purchase_date, status, total_amount, purchase_order_items(quantity, quantity_received, unit_cost)')
    .eq('supplier_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  const pos = (posRaw ?? []) as Array<{
    id: string
    po_number: string
    purchase_date: string
    status: string
    total_amount: number
    purchase_order_items: Array<{ quantity: number; quantity_received: number; unit_cost: number }> | null
  }>

  const commitmentFor = (po: (typeof pos)[number]) => {
    if (!['draft', 'submitted', 'partial'].includes(po.status)) return 0
    return po.purchase_order_items?.length
      ? po.purchase_order_items.reduce((sum, item) => {
          const remaining = Math.max(0, Number(item.quantity ?? 0) - Number(item.quantity_received ?? 0))
          return sum + remaining * Number(item.unit_cost ?? 0)
        }, 0)
      : Number(po.total_amount ?? 0)
  }
  const totalCommitment = pos.reduce((sum, po) => sum + commitmentFor(po), 0)

  return (
    <div className="animate-fade-in">
      <Header
        title={supplier.supplier_name}
        subtitle={supplier.supplier_code}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={withReturnTo(`/suppliers/po/new?supplier_id=${encodeURIComponent(supplier.id)}`, supplierPath)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Create PO
            </Link>
            <Link
              href={withReturnTo(`/suppliers/${supplier.id}/edit`, supplierPath)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
            >
              <Edit className="w-4 h-4" /> Edit
            </Link>
            <BackButton href={back.href} label={back.label} />
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

            {/* Open procurement commitment */}
            <div className={`rounded-xl border p-5 ${totalCommitment > 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'}`}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Open PO Commitment</p>
              <p className={`text-2xl font-bold ${totalCommitment > 0 ? 'text-indigo-700' : 'text-slate-900'}`}>
                {formatCurrency(totalCommitment)}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Procurement only — excluded from Accounts Payable</p>
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
                  href={withReturnTo(`/suppliers/po/new?supplier_id=${encodeURIComponent(supplier.id)}`, supplierPath)}
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
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Remaining Commitment</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pos.map((po) => (
                      <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3.5">
                          <DocumentLink
                            href={withReturnTo(`/suppliers/po/${po.id}`, supplierPath)}
                            tabLabel={po.po_number}
                            className="text-sm font-mono font-semibold text-blue-600 hover:text-blue-700"
                          >
                            {po.po_number}
                          </DocumentLink>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-slate-600 hidden md:table-cell">{formatDate(po.purchase_date)}</td>
                        <td className="px-4 py-3.5 text-right text-sm font-bold text-slate-900">{formatCurrency(po.total_amount)}</td>
                        <td className="px-4 py-3.5 text-right text-sm font-bold text-indigo-700">{formatCurrency(commitmentFor(po))}</td>
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
