import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileText, User, CreditCard, ClipboardList, Edit } from 'lucide-react'
import { formatCurrency, formatDate, getStatusColor, formatStatus } from '@/lib/utils'
import { InvoiceActions } from './InvoiceActions'
import { PrintActions } from '@/components/print/PrintActions'
import { InvoiceDateEditor } from './InvoiceDateEditor'

export const metadata = { title: 'Invoice Detail' }

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const admin = createAdminClient() as any

  const { data: invoiceRaw } = await admin
    .from('invoices')
    .select('*, customers(full_name, print_name, company_name, mobile_number, email, address, block, street, avenue, house_number, area, city), work_orders(work_order_number), users!invoices_created_by_fkey(full_name)')
    .eq('id', id)
    .single()

  if (!invoiceRaw) notFound()

  const invoice = invoiceRaw as unknown as {
    id: string
    invoice_number: string
    invoice_type: string
    invoice_date: string
    due_date: string | null
    ref_number: string | null
    subtotal: number
    discount_amount: number
    tax_rate: number
    tax_amount: number
    total_amount: number
    amount_paid: number
    balance_due: number
    status: string
    notes: string | null
    terms_and_conditions: string | null
    cancelled_reason: string | null
    created_at: string
    customers: {
      full_name: string; print_name: string | null; company_name: string | null; mobile_number: string; email: string | null
      address: string | null; block: string | null; street: string | null
      avenue: string | null; house_number: string | null; area: string | null; city: string | null
    } | null
    work_orders: { work_order_number: string } | null
    users: { full_name: string } | null
  }

  const { data: itemsRaw } = await admin
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', id)
    .order('sort_order')

  const items = (itemsRaw ?? []) as unknown as Array<{
    id: string
    description: string
    quantity: number
    unit_price: number
    discount_percent: number
    tax_percent: number
    line_total: number
    total_price: number
  }>

  const { data: paymentsRaw } = await supabase
    .from('payments')
    .select('id, payment_number, payment_date, amount_received, payment_mode, reference_number, notes, is_cancelled')
    .eq('invoice_id', id as unknown as string)
    .order('payment_date', { ascending: false })

  const payments = (paymentsRaw ?? []) as unknown as Array<{
    id: string
    payment_number: string
    payment_date: string
    amount_received: number
    payment_mode: string
    reference_number: string | null
    notes: string | null
    is_cancelled: boolean
  }>

  // Role check for edit access
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await (supabase as any)
    .from('users').select('role').eq('id', user!.id).single()
  const role = (profileRaw as { role: string } | null)?.role ?? ''
  const canEdit = ['admin', 'owner', 'manager'].includes(role) && !['cancelled', 'paid'].includes(invoice.status)

  // Fetch org for print letterhead
  const { data: orgRaw } = await admin
    .from('organizations')
    .select('name, logo_url, address, city, phone, email, vat_number')
    .limit(1).single()
  const org = orgRaw as { name: string; logo_url: string | null; address: string | null; city: string | null; phone: string | null; email: string | null; vat_number: string | null } | null

  const customer = invoice.customers
  const workOrder = invoice.work_orders
  const createdBy = invoice.users

  return (
    <div className="animate-fade-in">

      {/* ── PRINT-ONLY INVOICE TEMPLATE ─────────────────────── */}
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
                {org?.vat_number && <span className="font-semibold">TRN: {org.vat_number}</span>}
              </div>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-bold text-blue-700">INVOICE</h2>
            <p className="text-xl font-mono font-bold text-slate-900 mt-1">{invoice.invoice_number}</p>
          </div>
        </div>

        {/* Invoice meta + Bill To */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Bill To</p>
            <p className="font-bold text-slate-900 text-base">{customer?.print_name ?? customer?.full_name ?? '—'}</p>
            {!customer?.print_name && customer?.company_name && <p className="text-sm font-medium text-slate-700">{customer.company_name}</p>}
            {customer?.mobile_number && <p className="text-sm text-slate-600">{customer.mobile_number}</p>}
            {customer?.email && <p className="text-sm text-slate-600">{customer.email}</p>}
            {customer && (
              <div className="text-sm text-slate-600 mt-0.5 space-y-0.5">
                {customer.address && <p>{customer.address}</p>}
                {(customer.block || customer.street || customer.avenue || customer.house_number) && (
                  <p>{[customer.house_number && `House ${customer.house_number}`, customer.block && `Block ${customer.block}`, customer.street && `Street ${customer.street}`, customer.avenue && `Ave ${customer.avenue}`].filter(Boolean).join(', ')}</p>
                )}
                {(customer.area || customer.city) && <p>{[customer.area, customer.city].filter(Boolean).join(', ')}</p>}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="inline-block text-left space-y-1.5">
              {[
                { label: 'Invoice Date', value: formatDate(invoice.invoice_date) },
                { label: 'Due Date', value: invoice.due_date ? formatDate(invoice.due_date) : '—' },
                ...(invoice.ref_number ? [{ label: 'REF No.', value: invoice.ref_number }] : []),
                ...(workOrder ? [{ label: 'Work Order', value: workOrder.work_order_number }] : []),
                { label: 'Status', value: invoice.status.toUpperCase() },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-8 text-sm">
                  <span className="text-slate-500 w-28">{label}</span>
                  <span className="font-semibold text-slate-900">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Line items */}
        <table className="w-full mb-6 border border-slate-200">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2.5">#</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Description</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Qty</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Unit Price</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-4 py-2.5">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="px-4 py-2.5 text-sm text-slate-500">{idx + 1}</td>
                <td className="px-4 py-2.5 text-sm text-slate-900">{item.description}</td>
                <td className="px-4 py-2.5 text-sm text-right text-slate-700">{item.quantity}</td>
                <td className="px-4 py-2.5 text-sm text-right text-slate-700">{formatCurrency(item.unit_price)}</td>
                <td className="px-4 py-2.5 text-sm text-right font-semibold text-slate-900">
                  {formatCurrency(item.line_total ?? item.total_price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-72 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-medium">{formatCurrency(invoice.subtotal)}</span></div>
            {invoice.discount_amount > 0 && (
              <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="font-medium text-green-700">− {formatCurrency(invoice.discount_amount)}</span></div>
            )}
            <div className="border-t-2 border-slate-800 pt-2 flex justify-between text-base font-bold">
              <span>Total (KWD)</span><span>{formatCurrency(invoice.total_amount)}</span>
            </div>
            {invoice.amount_paid > 0 && (
              <div className="flex justify-between text-green-700"><span>Amount Paid</span><span className="font-semibold">− {formatCurrency(invoice.amount_paid)}</span></div>
            )}
            <div className={`flex justify-between font-bold text-base border-t border-slate-200 pt-2 ${invoice.balance_due > 0 ? 'text-red-700' : 'text-green-700'}`}>
              <span>Balance Due</span><span>{formatCurrency(invoice.balance_due)}</span>
            </div>
          </div>
        </div>

        {/* Terms & Notes */}
        {(invoice.notes || invoice.terms_and_conditions) && (
          <div className="border-t border-slate-200 pt-6 space-y-3 text-sm">
            {invoice.notes && <div><p className="font-bold text-slate-700 mb-1">Notes</p><p className="text-slate-600">{invoice.notes}</p></div>}
            {invoice.terms_and_conditions && <div><p className="font-bold text-slate-700 mb-1">Terms & Conditions</p><p className="text-slate-600 whitespace-pre-wrap">{invoice.terms_and_conditions}</p></div>}
          </div>
        )}

        {/* Signature */}
        <div className="mt-12 grid grid-cols-2 gap-12 border-t border-slate-200 pt-6">
          <div><div className="border-b border-slate-400 mb-2 h-10" /><p className="text-xs text-slate-500">Authorised Signature</p></div>
          <div><div className="border-b border-slate-400 mb-2 h-10" /><p className="text-xs text-slate-500">Customer Signature & Stamp</p></div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-8">This is a computer-generated invoice. Thank you for your business.</p>
      </div>
      {/* ── END PRINT TEMPLATE ──────────────────────────────── */}

      <Header
        title={invoice.invoice_number}
        subtitle={`Invoice · ${formatStatus(invoice.invoice_type)}`}
        actions={
          <div className="flex items-center gap-2">
            {canEdit && (
              <Link
                href={`/finance/invoices/${id}/edit`}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
              >
                <Edit className="w-4 h-4" /> Edit
              </Link>
            )}
            <PrintActions label="Print Invoice" />
            <Link
              href="/finance/invoices"
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
            >
              <ArrowLeft className="w-4 h-4" /> Invoices
            </Link>
          </div>
        }
      />

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column — 2/3 */}
          <div className="lg:col-span-2 space-y-5">
            {/* Invoice Header Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-lg font-mono">{invoice.invoice_number}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Created {formatDate(invoice.created_at)}{createdBy ? ` by ${createdBy.full_name}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(invoice.invoice_type)}`}>
                    {formatStatus(invoice.invoice_type)}
                  </span>
                  <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(invoice.status)}`}>
                    {formatStatus(invoice.status)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <InvoiceDateEditor
                  invoiceId={invoice.id}
                  field="invoice_date"
                  label="Invoice Date"
                  value={invoice.invoice_date}
                />
                <InvoiceDateEditor
                  invoiceId={invoice.id}
                  field="due_date"
                  label="Due Date"
                  value={invoice.due_date}
                />
                {invoice.ref_number && (
                  <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">REF No.</p>
                    <p className="font-semibold text-slate-900 font-mono">{invoice.ref_number}</p>
                  </div>
                )}
                {workOrder && (
                  <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Work Order</p>
                    <p className="font-semibold text-slate-900 font-mono">{workOrder.work_order_number}</p>
                  </div>
                )}
              </div>

              {invoice.cancelled_reason && (
                <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
                  <span className="font-semibold">Cancellation reason:</span> {invoice.cancelled_reason}
                </div>
              )}
            </div>

            {/* Line Items Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900">Line Items</h3>
              </div>
              {items.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No line items</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Description</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Qty</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Unit Price</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3.5 text-sm text-slate-900">{item.description}</td>
                        <td className="px-4 py-3.5 text-sm text-slate-700 text-right">{item.quantity}</td>
                        <td className="px-4 py-3.5 text-sm text-slate-700 text-right hidden md:table-cell">
                          {formatCurrency(item.unit_price)}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-slate-700 text-right hidden md:table-cell">
                          {item.discount_percent > 0 ? `${item.discount_percent}%` : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-sm font-semibold text-slate-900 text-right">
                          {formatCurrency(item.line_total ?? item.total_price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Totals section */}
              <div className="border-t border-slate-100 px-5 py-4">
                <div className="max-w-xs ml-auto space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
                  </div>
                  {invoice.discount_amount > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Discount</span>
                      <span className="font-medium text-green-700">− {formatCurrency(invoice.discount_amount)}</span>
                    </div>
                  )}
                  {invoice.tax_amount > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>VAT ({invoice.tax_rate}%)</span>
                      <span className="font-medium">{formatCurrency(invoice.tax_amount)}</span>
                    </div>
                  )}
                  <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-slate-900">
                    <span>Total</span>
                    <span>{formatCurrency(invoice.total_amount)}</span>
                  </div>
                  {invoice.amount_paid > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>Paid</span>
                      <span className="font-semibold">− {formatCurrency(invoice.amount_paid)}</span>
                    </div>
                  )}
                  <div className={`flex justify-between font-bold text-base ${invoice.balance_due > 0 ? 'text-amber-600' : 'text-green-700'}`}>
                    <span>Balance Due</span>
                    <span>{formatCurrency(invoice.balance_due)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            {(invoice.notes || invoice.terms_and_conditions) && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                {invoice.notes && (
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-2">Notes</h3>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{invoice.notes}</p>
                  </div>
                )}
                {invoice.terms_and_conditions && (
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-2">Terms & Conditions</h3>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{invoice.terms_and_conditions}</p>
                  </div>
                )}
              </div>
            )}

            {/* Payment History */}
            {payments.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900">Payment History</h3>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Payment #</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Date</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Mode</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Amount</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {payments.map((pay) => (
                      <tr key={pay.id} className={`hover:bg-slate-50 transition-colors ${pay.is_cancelled ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3.5">
                          <p className="text-sm font-mono font-semibold text-slate-900">{pay.payment_number}</p>
                          {pay.reference_number && (
                            <p className="text-xs text-slate-400">Ref: {pay.reference_number}</p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-slate-600 hidden md:table-cell">{formatDate(pay.payment_date)}</td>
                        <td className="px-4 py-3.5 text-sm text-slate-600 hidden md:table-cell capitalize">
                          {pay.payment_mode.replace(/_/g, ' ')}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className={`text-sm font-bold ${pay.is_cancelled ? 'line-through text-slate-400' : 'text-green-700'}`}>
                            {formatCurrency(pay.amount_received)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {pay.is_cancelled ? (
                            <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-1 rounded-full">Cancelled</span>
                          ) : (
                            <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-1 rounded-full">Received</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Linked Work Order */}
            {workOrder && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-slate-400" /> Linked Work Order
                </h3>
                <p className="text-sm font-mono font-semibold text-slate-900">{workOrder.work_order_number}</p>
              </div>
            )}
          </div>

          {/* Right column — 1/3 */}
          <div className="space-y-5">
            {/* Customer Card */}
            {customer && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-400" /> Customer
                </h3>
                <div className="space-y-1.5 text-sm">
                  <p className="font-semibold text-slate-900">{customer.full_name}</p>
                  {customer.company_name && <p className="text-slate-600 font-medium">{customer.company_name}</p>}
                  {customer.print_name && (
                    <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-md font-medium">
                      🖨 Prints as: {customer.print_name}
                    </p>
                  )}
                  <p className="text-slate-600">{customer.mobile_number}</p>
                  {customer.email && <p className="text-slate-600">{customer.email}</p>}
                  {(customer.area || customer.city) && (
                    <p className="text-slate-500">
                      {[customer.area, customer.city].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Payment Summary Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-slate-400" /> Payment Summary
              </h3>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Invoice Total</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(invoice.total_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Paid</span>
                  <span className="font-semibold text-green-700">{formatCurrency(invoice.amount_paid)}</span>
                </div>
                <div className={`flex justify-between border-t border-slate-100 pt-2.5 ${invoice.balance_due > 0 ? 'text-amber-600' : 'text-green-700'}`}>
                  <span className="font-bold">Balance Due</span>
                  <span className="font-bold">{formatCurrency(invoice.balance_due)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <InvoiceActions
              invoiceId={invoice.id}
              currentStatus={invoice.status}
              balanceDue={invoice.balance_due}
              customerId={customer ? (invoiceRaw as any).customer_id : ''}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
