import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'
import { PrintActions } from '@/components/print/PrintActions'

export const metadata = { title: 'Purchase Invoice' }

export default async function PurchaseInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient() as any
  const supabase = await createClient()

  const { data: invoiceRaw } = await admin
    .from('purchase_invoices')
    .select('*, suppliers(supplier_name, mobile_number, email)')
    .eq('id', id)
    .single()

  if (!invoiceRaw) notFound()

  const invoice = invoiceRaw as {
    id: string; invoice_number: string; supplier_id: string | null; supplier_name: string | null
    invoice_date: string; due_date: string | null; payment_type: string; payment_mode: string | null
    subtotal: number; total_amount: number; amount_paid: number; balance_due: number
    payment_status: string; notes: string | null; status: string; created_at: string
    suppliers: { supplier_name: string; mobile_number: string | null; email: string | null } | null
  }

  const { data: itemsRaw } = await admin
    .from('purchase_invoice_items')
    .select('*, inventory_items(item_name, item_code, unit_of_measure, current_stock)')
    .eq('purchase_invoice_id', id)
    .order('sort_order')

  const items = (itemsRaw ?? []) as Array<{
    id: string; description: string; quantity: number; unit_cost: number; total_cost: number
    unit_of_measure: string | null
    inventory_items: { item_name: string; item_code: string; unit_of_measure: string; current_stock: number } | null
  }>

  // Fetch org for print letterhead
  const { data: orgRaw } = await admin.from('organizations')
    .select('name, logo_url, address, city, phone, email').limit(1).single()
  const org = orgRaw as { name: string; logo_url: string | null; address: string | null; city: string | null; phone: string | null; email: string | null } | null

  const supplierDisplay = invoice.suppliers?.supplier_name ?? invoice.supplier_name ?? '—'
  const isCash = invoice.payment_type === 'cash'
  const isCancelled = invoice.status === 'cancelled'

  return (
    <div className="animate-fade-in">

      {/* ── PRINT TEMPLATE ─────────────────────────────────────── */}
      <div className="hidden print:block p-10 text-slate-900">
        {/* Letterhead */}
        <div className="flex items-start justify-between pb-6 border-b-2 border-slate-800 mb-8">
          <div className="flex items-start gap-4">
            {org?.logo_url ? (
              <img src={org.logo_url} alt={org.name} className="h-16 w-auto object-contain" />
            ) : (
              <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                {org?.name?.slice(0, 2).toUpperCase() ?? 'FO'}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold">{org?.name}</h1>
              {org?.address && <p className="text-sm text-slate-600 mt-0.5">{org.address}{org.city ? `, ${org.city}` : ''}</p>}
              <div className="flex flex-wrap gap-x-4 mt-0.5 text-sm text-slate-600">
                {org?.phone && <span>Tel: {org.phone}</span>}
                {org?.email && <span>{org.email}</span>}
              </div>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-bold text-blue-700">PURCHASE INVOICE</h2>
            <p className="text-xl font-mono font-bold text-slate-900 mt-1">{invoice.invoice_number}</p>
          </div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Supplier</p>
            <p className="font-bold text-slate-900 text-base">{supplierDisplay}</p>
            {invoice.suppliers?.mobile_number && <p className="text-sm text-slate-600">{invoice.suppliers.mobile_number}</p>}
          </div>
          <div className="text-right">
            <div className="inline-block text-left space-y-1.5">
              {[
                { label: 'Invoice Date', value: formatDate(invoice.invoice_date) },
                { label: 'Payment Type', value: isCash ? 'Cash' : 'Credit' },
                ...(invoice.due_date ? [{ label: 'Due Date', value: formatDate(invoice.due_date) }] : []),
                { label: 'Status', value: invoice.payment_status.toUpperCase() },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-8 text-sm">
                  <span className="text-slate-500 w-28">{label}</span>
                  <span className="font-semibold text-slate-900">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Items table */}
        <table className="w-full mb-6 border border-slate-200">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2.5">#</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Item</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Qty</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Unit</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Unit Cost</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="px-4 py-2.5 text-sm text-slate-500">{idx + 1}</td>
                <td className="px-4 py-2.5 text-sm text-slate-900">
                  <div className="font-medium">{item.description}</div>
                  {item.inventory_items && <div className="text-xs text-slate-400">{item.inventory_items.item_code}</div>}
                </td>
                <td className="px-4 py-2.5 text-sm text-right text-slate-700">{item.quantity}</td>
                <td className="px-4 py-2.5 text-sm text-right text-slate-500">{item.inventory_items?.unit_of_measure ?? item.unit_of_measure ?? ''}</td>
                <td className="px-4 py-2.5 text-sm text-right text-slate-700">{formatCurrency(item.unit_cost)}</td>
                <td className="px-4 py-2.5 text-sm text-right font-semibold text-slate-900">{formatCurrency(item.total_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-72 space-y-2 text-sm">
            <div className="border-t-2 border-slate-800 pt-2 flex justify-between text-base font-bold">
              <span>Total (KWD)</span><span>{formatCurrency(invoice.total_amount)}</span>
            </div>
            {invoice.amount_paid > 0 && (
              <div className="flex justify-between text-green-700"><span>Amount Paid</span><span className="font-semibold">{formatCurrency(invoice.amount_paid)}</span></div>
            )}
            {invoice.balance_due > 0 && (
              <div className="flex justify-between text-red-700 font-bold border-t border-slate-200 pt-2">
                <span>Balance Due</span><span>{formatCurrency(invoice.balance_due)}</span>
              </div>
            )}
          </div>
        </div>

        {invoice.notes && (
          <div className="border-t border-slate-200 pt-4 text-sm">
            <p className="font-bold text-slate-700 mb-1">Notes</p>
            <p className="text-slate-600">{invoice.notes}</p>
          </div>
        )}
        <p className="text-center text-xs text-slate-400 mt-8">This is a computer-generated purchase invoice.</p>
      </div>
      {/* ── END PRINT TEMPLATE ─────────────────────────────────── */}

      <Header
        title={invoice.invoice_number}
        subtitle="Purchase Invoice"
        actions={
          <div className="flex items-center gap-2">
            <PrintActions label="Print" />
            <Link href="/inventory/purchase-invoices"
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
          </div>
        }
      />

      <div className="p-6 max-w-4xl space-y-5">
        {/* Status banner */}
        {isCancelled && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl px-4 py-3">
            This purchase invoice has been cancelled.
          </div>
        )}

        {/* Header card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 text-sm">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Supplier</p>
              <p className="font-semibold text-slate-900">{supplierDisplay}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Invoice Date</p>
              <p className="font-semibold text-slate-900">{formatDate(invoice.invoice_date)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Payment Type</p>
              <span className={`inline-flex items-center text-xs font-bold px-3 py-1 rounded-full ${isCash ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {isCash ? '💵 Cash' : '🏦 Credit'}
              </span>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Payment Status</p>
              <span className={`inline-flex items-center text-xs font-bold px-3 py-1 rounded-full ${invoice.payment_status === 'paid' ? 'bg-green-100 text-green-700' : invoice.payment_status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                {invoice.payment_status.charAt(0).toUpperCase() + invoice.payment_status.slice(1)}
              </span>
            </div>
            {invoice.due_date && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Due Date</p>
                <p className="font-semibold text-slate-900">{formatDate(invoice.due_date)}</p>
              </div>
            )}
            {invoice.payment_mode && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Payment Mode</p>
                <p className="font-semibold text-slate-900 capitalize">{invoice.payment_mode.replace(/_/g, ' ')}</p>
              </div>
            )}
          </div>
          {invoice.notes && (
            <div className="mt-4 pt-4 border-t border-slate-100 text-sm text-slate-600">
              <span className="font-semibold text-slate-700">Notes: </span>{invoice.notes}
            </div>
          )}
        </div>

        {/* Items */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Items Purchased</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Item</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Qty</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Unit Cost</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <p className="text-sm font-medium text-slate-900">{item.description}</p>
                    {item.inventory_items && (
                      <p className="text-xs text-slate-400">{item.inventory_items.item_code} · {item.inventory_items.unit_of_measure} · Stock now: {item.inventory_items.current_stock}</p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm text-slate-700">{item.quantity}</td>
                  <td className="px-4 py-3.5 text-right text-sm text-slate-700 hidden md:table-cell">{formatCurrency(item.unit_cost)}</td>
                  <td className="px-4 py-3.5 text-right text-sm font-semibold text-slate-900">{formatCurrency(item.total_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="border-t border-slate-100 px-5 py-4">
            <div className="max-w-xs ml-auto space-y-2 text-sm">
              <div className="flex justify-between font-bold text-slate-900 text-base border-t border-slate-200 pt-2">
                <span>Total</span><span>{formatCurrency(invoice.total_amount)}</span>
              </div>
              {invoice.amount_paid > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Paid</span><span className="font-semibold">{formatCurrency(invoice.amount_paid)}</span>
                </div>
              )}
              {invoice.balance_due > 0 && (
                <div className="flex justify-between text-red-700 font-bold">
                  <span>Balance Due</span><span>{formatCurrency(invoice.balance_due)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
