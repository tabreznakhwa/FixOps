import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Edit, FileText, User } from 'lucide-react'
import { BackButton } from '@/components/ui/BackButton'
import { PrintActions } from '@/components/print/PrintActions'
import { formatCurrency, formatDate, formatStatus, getStatusColor } from '@/lib/utils'
import { QuotationActions } from './QuotationActions'

export const metadata = { title: 'Quotation Detail' }

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = user
    ? await supabase.from('users').select('organization_id, role').eq('id', user.id).single()
    : { data: null }
  const profile = profileRaw as { organization_id: string | null; role: string } | null
  if (!profile?.organization_id || !['owner', 'admin'].includes(profile.role)) redirect('/dashboard?error=unauthorized')

  const { data: quotationRaw } = await admin
    .from('quotations')
    .select('*, customers(full_name, print_name, company_name, mobile_number, email, address, block, street, avenue, house_number, area, city), work_orders(work_order_number), users!quotations_created_by_fkey(full_name)')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (!quotationRaw) notFound()

  const quotation = quotationRaw as unknown as {
    id: string
    quotation_number: string
    customer_id: string
    work_order_id: string | null
    quotation_date: string
    valid_until: string | null
    status: string
    subtotal: number
    discount_amount: number
    tax_amount: number
    total_amount: number
    notes: string | null
    terms_and_conditions: string | null
    created_at: string
    customers: {
      full_name: string; print_name: string | null; company_name: string | null; mobile_number: string; email: string | null
      address: string | null; block: string | null; street: string | null; avenue: string | null; house_number: string | null; area: string | null; city: string | null
    } | null
    work_orders: { work_order_number: string } | null
    users: { full_name: string } | null
  }

  const { data: itemsRaw } = await admin
    .from('quotation_items')
    .select('*')
    .eq('quotation_id', id)
    .eq('organization_id', profile.organization_id)
    .order('sort_order')

  const items = (itemsRaw ?? []) as unknown as Array<{
    id: string
    description: string
    quantity: number
    unit_price: number
    total_price: number
  }>

  const { data: orgRaw } = await admin
    .from('organizations')
    .select('name, logo_url, address, city, phone, email, vat_number')
    .eq('id', profile.organization_id)
    .single()
  const org = orgRaw as { name: string; logo_url: string | null; address: string | null; city: string | null; phone: string | null; email: string | null; vat_number: string | null } | null

  const customer = quotation.customers
  const workOrder = quotation.work_orders
  const createdBy = quotation.users
  const canEdit = quotation.status !== 'converted'

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block p-6 text-slate-900 text-[13px]">
        <div className="flex items-start justify-between pb-3 border-b-2 border-slate-800 mb-4">
          <div className="flex items-start gap-3">
            {org?.logo_url ? <img src={org.logo_url} alt={org.name} className="h-12 w-auto object-contain" /> : (
              <div className="w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0">{org?.name?.slice(0, 2).toUpperCase() ?? 'FO'}</div>
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
            <h2 className="text-2xl font-bold text-blue-700">QUOTATION</h2>
            <p className="text-lg font-mono font-bold text-slate-900 mt-0.5">{quotation.quotation_number}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-4">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Quote To</p>
            <p className="font-bold text-slate-900 text-sm">{customer?.print_name ?? customer?.full_name ?? '—'}</p>
            {!customer?.print_name && customer?.company_name && <p className="text-xs font-medium text-slate-700">{customer.company_name}</p>}
            {customer?.mobile_number && <p className="text-xs text-slate-600">{customer.mobile_number}</p>}
            {customer?.email && <p className="text-xs text-slate-600">{customer.email}</p>}
            {customer && (
              <div className="text-xs text-slate-600 mt-0.5 space-y-0.5">
                {customer.address && <p>{customer.address}</p>}
                {(customer.block || customer.street || customer.avenue || customer.house_number) && <p>{[customer.block && `Block ${customer.block}`, customer.street && `Street ${customer.street}`, customer.avenue && `Ave ${customer.avenue}`, customer.house_number && `House ${customer.house_number}`].filter(Boolean).join(', ')}</p>}
                {(customer.area || customer.city) && <p>{[customer.area, customer.city].filter(Boolean).join(', ')}</p>}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="inline-block text-left space-y-1">
              {[
                { label: 'Quotation Date', value: formatDate(quotation.quotation_date) },
                { label: 'Valid Until', value: quotation.valid_until ? formatDate(quotation.valid_until) : '—' },
                ...(workOrder ? [{ label: 'Work Order', value: workOrder.work_order_number }] : []),
                { label: 'Status', value: quotation.status.toUpperCase() },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-8 text-xs"><span className="text-slate-500 w-28">{label}</span><span className="font-semibold text-slate-900">{value}</span></div>
              ))}
            </div>
          </div>
        </div>

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
                <td className="px-3 py-1.5 text-xs text-right font-semibold text-slate-900">{formatCurrency(item.total_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-4">
          <div className="w-64 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-medium">{formatCurrency(quotation.subtotal)}</span></div>
            {quotation.discount_amount > 0 && <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="font-medium text-green-700">− {formatCurrency(quotation.discount_amount)}</span></div>}
            <div className="border-t-2 border-slate-800 pt-1.5 flex justify-between text-sm font-bold"><span>Total (KWD)</span><span>{formatCurrency(quotation.total_amount)}</span></div>
          </div>
        </div>

        {(quotation.notes || quotation.terms_and_conditions) && (
          <div className="border-t border-slate-200 pt-3 space-y-2 text-xs">
            {quotation.notes && <div><p className="font-bold text-slate-700 mb-0.5">Notes</p><p className="text-slate-600 whitespace-pre-wrap">{quotation.notes}</p></div>}
            {quotation.terms_and_conditions && <div><p className="font-bold text-slate-700 mb-0.5">Terms & Conditions</p><p className="text-slate-600 whitespace-pre-wrap">{quotation.terms_and_conditions}</p></div>}
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-12 border-t border-slate-200 pt-3">
          <div><div className="border-b border-slate-400 mb-1.5 h-8" /><p className="text-[10px] text-slate-500">Authorised Signature</p></div>
          <div><div className="border-b border-slate-400 mb-1.5 h-8" /><p className="text-[10px] text-slate-500">Customer Approval Signature & Stamp</p></div>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-3">This quotation is valid until the date shown above unless otherwise agreed.</p>
      </div>

      <div className="print:hidden">
        <Header
          title={quotation.quotation_number}
          subtitle="Customer quotation"
          actions={
            <div className="flex items-center gap-2">
              {canEdit && (
                <Link href={`/finance/quotations/${id}/edit`} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
                  <Edit className="w-4 h-4" /> Edit
                </Link>
              )}
              <PrintActions label="Print Quotation" />
              <BackButton fallbackHref="/finance/quotations" label="Quotations" />
            </div>
          }
        />

        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center"><FileText className="w-5 h-5 text-blue-600" /></div>
                  <div>
                    <p className="font-bold text-slate-900 text-lg font-mono">{quotation.quotation_number}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Created {formatDate(quotation.created_at)}{createdBy ? ` by ${createdBy.full_name}` : ''}</p>
                  </div>
                </div>
                <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(quotation.status)}`}>{formatStatus(quotation.status)}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div><p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Quotation Date</p><p className="font-semibold text-slate-900">{formatDate(quotation.quotation_date)}</p></div>
                <div><p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Valid Until</p><p className="font-semibold text-slate-900">{quotation.valid_until ? formatDate(quotation.valid_until) : '—'}</p></div>
                {workOrder && <div><p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Work Order</p><p className="font-semibold text-slate-900 font-mono">{workOrder.work_order_number}</p></div>}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100"><h3 className="font-semibold text-slate-900">Line Items</h3></div>
              <table className="w-full">
                <thead><tr className="bg-slate-50 border-b border-slate-100"><th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Description</th><th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Qty</th><th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Unit Price</th><th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Total</th></tr></thead>
                <tbody className="divide-y divide-slate-50">{items.map(item => (<tr key={item.id} className="hover:bg-slate-50"><td className="px-4 py-3.5 text-sm text-slate-900">{item.description}</td><td className="px-4 py-3.5 text-sm text-slate-700 text-right">{item.quantity}</td><td className="px-4 py-3.5 text-sm text-slate-700 text-right hidden md:table-cell">{formatCurrency(item.unit_price)}</td><td className="px-4 py-3.5 text-sm font-semibold text-slate-900 text-right">{formatCurrency(item.total_price)}</td></tr>))}</tbody>
              </table>
              <div className="border-t border-slate-100 px-5 py-4"><div className="max-w-xs ml-auto space-y-2 text-sm"><div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="font-medium">{formatCurrency(quotation.subtotal)}</span></div>{quotation.discount_amount > 0 && <div className="flex justify-between text-slate-600"><span>Discount</span><span className="font-medium text-green-700">− {formatCurrency(quotation.discount_amount)}</span></div>}<div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-slate-900"><span>Total</span><span>{formatCurrency(quotation.total_amount)}</span></div></div></div>
            </div>

            {(quotation.notes || quotation.terms_and_conditions) && <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">{quotation.notes && <div><h3 className="font-semibold text-slate-900 mb-2">Notes</h3><p className="text-sm text-slate-600 whitespace-pre-wrap">{quotation.notes}</p></div>}{quotation.terms_and_conditions && <div><h3 className="font-semibold text-slate-900 mb-2">Terms & Conditions</h3><p className="text-sm text-slate-600 whitespace-pre-wrap">{quotation.terms_and_conditions}</p></div>}</div>}
          </div>

          <div className="space-y-5">
            {customer && <div className="bg-white rounded-xl border border-slate-200 p-5"><h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2"><User className="w-4 h-4 text-slate-400" /> Customer</h3><div className="space-y-1.5 text-sm"><p className="font-semibold text-slate-900">{customer.full_name}</p>{customer.company_name && <p className="text-slate-600 font-medium">{customer.company_name}</p>}<p className="text-slate-600">{customer.mobile_number}</p>{customer.email && <p className="text-slate-600">{customer.email}</p>}{(customer.area || customer.city) && <p className="text-slate-500">{[customer.area, customer.city].filter(Boolean).join(', ')}</p>}</div></div>}
            <div className="bg-white rounded-xl border border-slate-200 p-5"><h3 className="font-semibold text-slate-900 mb-3">Quotation Summary</h3><div className="space-y-2.5 text-sm"><div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-semibold text-slate-900">{formatCurrency(quotation.subtotal)}</span></div><div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="font-semibold text-green-700">{formatCurrency(quotation.discount_amount)}</span></div><div className="flex justify-between border-t border-slate-100 pt-2.5 text-blue-700"><span className="font-bold">Total</span><span className="font-bold">{formatCurrency(quotation.total_amount)}</span></div></div></div>
            <QuotationActions quotationId={quotation.id} currentStatus={quotation.status} />
          </div>
        </div>
      </div>
    </div>
  )
}
