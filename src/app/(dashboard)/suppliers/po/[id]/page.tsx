import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft, Building2, Calendar, FileText, DollarSign } from 'lucide-react'
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils'
import { POActions } from './POActions'
import { PrintActions } from '@/components/print/PrintActions'

export const metadata = { title: 'Purchase Order' }

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  partial: 'Partially Received',
  received: 'Received',
  cancelled: 'Cancelled',
}

export default async function PODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: poRaw } = await (supabase as any)
    .from('purchase_orders')
    .select(`
      id, po_number, purchase_date, status, payment_status,
      total_amount, amount_paid, balance_due, notes, created_at,
      suppliers(id, supplier_name, supplier_code, contact_person, mobile_number, email, city)
    `)
    .eq('id', id)
    .single()

  // Fetch optional columns separately (may not exist before migration)
  const { data: poExtRaw } = await (supabase as any)
    .from('purchase_orders')
    .select('expected_delivery_date, supplier_invoice_number')
    .eq('id', id)
    .maybeSingle()
    .then((r: any) => r.error ? { data: null } : r)

  if (!poRaw) notFound()

  const poExt = (poExtRaw ?? {}) as { expected_delivery_date?: string | null; supplier_invoice_number?: string | null }
  const po = {
    ...(poRaw as {
      id: string; po_number: string; purchase_date: string; status: string; payment_status: string
      total_amount: number; amount_paid: number; balance_due: number; notes: string | null; created_at: string
      suppliers: {
        id: string; supplier_name: string; supplier_code: string; contact_person: string | null
        mobile_number: string | null; email: string | null; city: string | null
      } | null
    }),
    expected_delivery_date: poExt.expected_delivery_date ?? null,
    supplier_invoice_number: poExt.supplier_invoice_number ?? null,
  }

  const { data: itemsRaw } = await (supabase as any)
    .from('purchase_order_items')
    .select('id, description, category, quantity, quantity_received, unit_cost, total_cost')
    .eq('purchase_order_id', id)
    .order('id')

  const items = (itemsRaw ?? []) as Array<{
    id: string; description: string; category: string | null; quantity: number; quantity_received: number
    unit_cost: number; total_cost: number
  }>

  const { data: paymentsRaw } = await (supabase as any)
    .from('supplier_payments')
    .select('id, payment_date, amount_paid, payment_mode, reference_number, notes')
    .eq('purchase_order_id', id)
    .order('payment_date', { ascending: false })

  const payments = (paymentsRaw ?? []) as Array<{
    id: string; payment_date: string; amount_paid: number; payment_mode: string
    reference_number: string | null; notes: string | null
  }>

  const supplier = po.suppliers

  return (
    <div className="animate-fade-in">
      <Header
        title={po.po_number}
        subtitle={`Purchase Order · ${formatDate(po.purchase_date)}`}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Link
              href="/suppliers?tab=po"
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
            <PrintActions />
          </div>
        }
      />

      <div className="p-6 space-y-5">
        {/* Status + Summary row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">PO Status</p>
            <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${getStatusColor(po.status)}`}>
              {STATUS_LABELS[po.status] ?? po.status}
            </span>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Amount</p>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(po.total_amount)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Amount Paid</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(po.amount_paid)}</p>
          </div>
          <div className={`rounded-xl border p-4 ${po.balance_due > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Balance Due</p>
            <p className={`text-xl font-bold ${po.balance_due > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {formatCurrency(po.balance_due)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: Supplier + PO info */}
          <div className="space-y-4">
            {/* Supplier card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-900">Supplier</h3>
              </div>
              {supplier ? (
                <div className="space-y-1.5 text-sm">
                  <Link href={`/suppliers/${supplier.id}`} className="font-bold text-blue-700 hover:underline">
                    {supplier.supplier_name}
                  </Link>
                  <p className="text-slate-400 font-mono text-xs">{supplier.supplier_code}</p>
                  {supplier.contact_person && <p className="text-slate-600">{supplier.contact_person}</p>}
                  {supplier.mobile_number && (
                    <a href={`tel:${supplier.mobile_number}`} className="text-slate-600 hover:text-blue-600 block">{supplier.mobile_number}</a>
                  )}
                  {supplier.city && <p className="text-slate-500 text-xs">{supplier.city}</p>}
                </div>
              ) : (
                <p className="text-slate-400 text-sm">No supplier linked</p>
              )}
            </div>

            {/* PO Details */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-900">Order Details</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">PO Number</span>
                  <span className="font-mono font-semibold text-slate-900">{po.po_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Purchase Date</span>
                  <span className="text-slate-800">{formatDate(po.purchase_date)}</span>
                </div>
                {po.expected_delivery_date && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Expected Delivery</span>
                    <span className="text-slate-800">{formatDate(po.expected_delivery_date)}</span>
                  </div>
                )}
                {po.supplier_invoice_number && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Supplier Invoice</span>
                    <span className="font-mono text-slate-800">{po.supplier_invoice_number}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Payment Status</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(po.payment_status)}`}>
                    {po.payment_status}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 print:hidden">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Actions</h3>
              <POActions poId={po.id} poStatus={po.status} items={items} />
              <div className="mt-3">
                <Link
                  href={`/suppliers/vendor-payments?po=${po.id}`}
                  className="flex items-center gap-2 w-full px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors justify-center"
                >
                  <DollarSign className="w-4 h-4" /> Record Vendor Payment
                </Link>
              </div>
            </div>
          </div>

          {/* Right: Line items + payments */}
          <div className="lg:col-span-2 space-y-5">
            {/* Line Items */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-900">Line Items</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Item</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ordered</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Received</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Unit Price</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((item) => {
                    const fullyReceived = item.quantity_received >= item.quantity
                    return (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3.5 font-medium text-slate-800">{item.description}</td>
                        <td className="px-4 py-3.5">
                          {item.category ? (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                              {item.category}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Uncategorized</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center text-slate-600">{item.quantity}</td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            fullyReceived ? 'bg-green-100 text-green-700'
                              : item.quantity_received > 0 ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {item.quantity_received ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right text-slate-600">{formatCurrency(item.unit_cost)}</td>
                        <td className="px-5 py-3.5 text-right font-semibold text-slate-900">{formatCurrency(item.total_cost)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td colSpan={5} className="px-5 py-3 text-sm font-bold text-slate-700 text-right">Total</td>
                    <td className="px-5 py-3 text-right text-base font-bold text-slate-900">{formatCurrency(po.total_amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Vendor Payments */}
            {payments.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Vendor Payments</h3>
                  <span className="text-xs text-slate-500">{payments.length} payment{payments.length > 1 ? 's' : ''}</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Mode</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Reference</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-600">{formatDate(p.payment_date)}</td>
                        <td className="px-4 py-3 text-slate-600 capitalize">{p.payment_mode.replace('_', ' ')}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.reference_number ?? '—'}</td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatCurrency(p.amount_paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {po.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-amber-900">{po.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
