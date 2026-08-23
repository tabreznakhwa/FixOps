import { formatCurrency, formatDate } from '@/lib/utils'

export interface PrintableInvoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string | null
  ref_number: string | null
  subtotal: number
  discount_amount: number
  total_amount: number
  amount_paid: number
  balance_due: number
  status: string
  notes: string | null
  terms_and_conditions: string | null
  customers: {
    full_name: string; print_name: string | null; company_name: string | null; mobile_number: string; email: string | null
    address: string | null; block: string | null; street: string | null
    avenue: string | null; house_number: string | null; area: string | null; city: string | null
  } | null
  work_orders: { work_order_number: string } | null
}

export interface PrintableInvoiceItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  line_total: number
  total_price: number
}

export interface PrintableOrg {
  name: string; logo_url: string | null; address: string | null; city: string | null
  phone: string | null; email: string | null; vat_number: string | null
}

/**
 * The print-only invoice layout — shared by the single Invoice Detail page
 * and the multi-invoice batch print page (Receivables → select invoices →
 * Print/Save PDF), so both stay visually identical and only need fixing once.
 */
export function InvoicePrintTemplate({
  invoice, items, org, className = '',
}: {
  invoice: PrintableInvoice
  items: PrintableInvoiceItem[]
  org: PrintableOrg | null
  className?: string
}) {
  const customer = invoice.customers
  const workOrder = invoice.work_orders

  return (
    <div className={`p-6 text-slate-900 text-[13px] ${className}`}>
      {/* Letterhead */}
      <div className="flex items-start justify-between pb-3 border-b-2 border-slate-800 mb-4">
        <div className="flex items-start gap-3">
          {org?.logo_url ? (
            <img src={org.logo_url} alt={org.name} className="h-12 w-auto object-contain" />
          ) : (
            <div className="w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
              {org?.name?.slice(0, 2).toUpperCase() ?? 'FO'}
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold">{org?.name}</h1>
            {org?.address && <p className="text-xs text-slate-600 mt-0.5">{org.address}{org.city ? `, ${org.city}` : ''}</p>}
            <div className="flex flex-wrap gap-x-4 mt-0.5 text-xs text-slate-600">
              {org?.phone && <span>Tel: {org.phone}</span>}
              {org?.email && <span>{org.email}</span>}
              {org?.vat_number && <span className="font-semibold">TRN: {org.vat_number}</span>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-bold text-blue-700">INVOICE</h2>
          <p className="text-lg font-mono font-bold text-slate-900 mt-0.5">{invoice.invoice_number}</p>
        </div>
      </div>

      {/* Invoice meta + Bill To */}
      <div className="grid grid-cols-2 gap-8 mb-4">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Bill To</p>
          <p className="font-bold text-slate-900 text-sm">{customer?.print_name ?? customer?.full_name ?? '—'}</p>
          {!customer?.print_name && customer?.company_name && <p className="text-xs font-medium text-slate-700">{customer.company_name}</p>}
          {customer?.mobile_number && <p className="text-xs text-slate-600">{customer.mobile_number}</p>}
          {customer?.email && <p className="text-xs text-slate-600">{customer.email}</p>}
          {customer && (
            <div className="text-xs text-slate-600 mt-0.5 space-y-0.5">
              {customer.address && <p>{customer.address}</p>}
              {(customer.block || customer.street || customer.avenue || customer.house_number) && (
                <p>{[customer.block && `Block ${customer.block}`, customer.street && `Street ${customer.street}`, customer.avenue && `Ave ${customer.avenue}`, customer.house_number && `House ${customer.house_number}`].filter(Boolean).join(', ')}</p>
              )}
              {(customer.area || customer.city) && <p>{[customer.area, customer.city].filter(Boolean).join(', ')}</p>}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="inline-block text-left space-y-1">
            {[
              { label: 'Invoice Date', value: formatDate(invoice.invoice_date) },
              { label: 'Due Date', value: invoice.due_date ? formatDate(invoice.due_date) : '—' },
              ...(invoice.ref_number ? [{ label: 'REF No.', value: invoice.ref_number }] : []),
              ...(workOrder ? [{ label: 'Work Order', value: workOrder.work_order_number }] : []),
              { label: 'Status', value: invoice.status.toUpperCase() },
            ].map(({ label, value }) => (
              <div key={label} className="flex gap-8 text-xs">
                <span className="text-slate-500 w-28">{label}</span>
                <span className="font-semibold text-slate-900">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Line items */}
      <table className="w-full mb-3 border border-slate-200">
        <thead>
          <tr className="bg-slate-800 text-white">
            <th className="text-left text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5">#</th>
            <th className="text-left text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5">Description</th>
            <th className="text-right text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5">Qty</th>
            <th className="text-right text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5">Unit Price</th>
            <th className="text-right text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id} className="border-b border-slate-100">
              <td className="px-3 py-1.5 text-xs text-slate-500">{idx + 1}</td>
              <td className="px-3 py-1.5 text-xs text-slate-900">{item.description}</td>
              <td className="px-3 py-1.5 text-xs text-right text-slate-700">{item.quantity}</td>
              <td className="px-3 py-1.5 text-xs text-right text-slate-700">{formatCurrency(item.unit_price)}</td>
              <td className="px-3 py-1.5 text-xs text-right font-semibold text-slate-900">
                {formatCurrency(item.line_total ?? item.total_price)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-4">
        <div className="w-64 space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-medium">{formatCurrency(invoice.subtotal)}</span></div>
          {invoice.discount_amount > 0 && (
            <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="font-medium text-green-700">− {formatCurrency(invoice.discount_amount)}</span></div>
          )}
          <div className="border-t-2 border-slate-800 pt-1.5 flex justify-between text-sm font-bold">
            <span>Total (KWD)</span><span>{formatCurrency(invoice.total_amount)}</span>
          </div>
          {invoice.amount_paid > 0 && (
            <div className="flex justify-between text-green-700"><span>Amount Paid</span><span className="font-semibold">− {formatCurrency(invoice.amount_paid)}</span></div>
          )}
          <div className={`flex justify-between font-bold text-sm border-t border-slate-200 pt-1.5 ${invoice.balance_due > 0 ? 'text-red-700' : 'text-green-700'}`}>
            <span>Balance Due</span><span>{formatCurrency(invoice.balance_due)}</span>
          </div>
        </div>
      </div>

      {/* Terms & Notes */}
      {(invoice.notes || invoice.terms_and_conditions) && (
        <div className="border-t border-slate-200 pt-3 space-y-2 text-xs">
          {invoice.notes && <div><p className="font-bold text-slate-700 mb-0.5">Notes</p><p className="text-slate-600">{invoice.notes}</p></div>}
          {invoice.terms_and_conditions && <div><p className="font-bold text-slate-700 mb-0.5">Terms & Conditions</p><p className="text-slate-600 whitespace-pre-wrap">{invoice.terms_and_conditions}</p></div>}
        </div>
      )}

      {/* Signature */}
      <div className="mt-6 grid grid-cols-2 gap-12 border-t border-slate-200 pt-3">
        <div><div className="border-b border-slate-400 mb-1.5 h-8" /><p className="text-[10px] text-slate-500">Authorised Signature</p></div>
        <div><div className="border-b border-slate-400 mb-1.5 h-8" /><p className="text-[10px] text-slate-500">Customer Signature & Stamp</p></div>
      </div>
      <p className="text-center text-[10px] text-slate-400 mt-3">This is a computer-generated invoice. Thank you for your business.</p>
    </div>
  )
}
