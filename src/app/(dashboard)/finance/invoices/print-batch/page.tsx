import { createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { PrintActions } from '@/components/print/PrintActions'
import { InvoicePrintTemplate, type PrintableInvoice, type PrintableInvoiceItem } from '@/components/print/InvoicePrintTemplate'
import { notFound } from 'next/navigation'
import { FileText } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

export const metadata = { title: 'Print Invoices' }

/**
 * Prints/saves-as-PDF a batch of invoices in one job — e.g. selecting several
 * of a customer's outstanding invoices from Receivables. Reuses the exact
 * print template from the single Invoice Detail page (InvoicePrintTemplate)
 * so a batch-printed invoice looks identical to one printed individually,
 * just repeated once per invoice with a page break in between.
 */
export default async function PrintBatchInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; return_to?: string }>
}) {
  const { ids: idsParam, return_to } = await searchParams
  const ids = (idsParam ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) notFound()

  const admin = createAdminClient() as any

  const [{ data: invoicesRaw }, { data: orgRaw }] = await Promise.all([
    admin
      .from('invoices')
      .select('*, customers(full_name, print_name, company_name, mobile_number, email, address, block, street, avenue, house_number, area, city), work_orders(work_order_number)')
      .in('id', ids),
    admin
      .from('organizations')
      .select('name, logo_url, address, city, phone, email, vat_number')
      .limit(1).single(),
  ])

  const invoicesById = new Map(((invoicesRaw ?? []) as PrintableInvoice[]).map(inv => [inv.id, inv]))
  // Preserve the order the user selected them in, not whatever order the DB returns.
  const invoices = ids.map(id => invoicesById.get(id)).filter((inv): inv is PrintableInvoice => !!inv)

  if (invoices.length === 0) notFound()

  const org = orgRaw as { name: string; logo_url: string | null; address: string | null; city: string | null; phone: string | null; email: string | null; vat_number: string | null } | null

  const { data: itemsRaw } = await admin
    .from('invoice_items')
    .select('*')
    .in('invoice_id', ids)
    .order('sort_order')

  const itemsByInvoice = new Map<string, PrintableInvoiceItem[]>()
  for (const item of (itemsRaw ?? []) as (PrintableInvoiceItem & { invoice_id: string })[]) {
    const list = itemsByInvoice.get(item.invoice_id) ?? []
    list.push(item)
    itemsByInvoice.set(item.invoice_id, list)
  }

  const backHref = return_to ?? '/finance/receivables'
  const totalDue = invoices.reduce((s, inv) => s + inv.balance_due, 0)

  return (
    <div className="animate-fade-in">
      {/* ── PRINT-ONLY: one invoice per page ────────────────── */}
      <div className="hidden print:block">
        {invoices.map(invoice => (
          <div key={invoice.id} className="print-page-break">
            <InvoicePrintTemplate invoice={invoice} items={itemsByInvoice.get(invoice.id) ?? []} org={org} />
          </div>
        ))}
      </div>

      {/* ── SCREEN-ONLY: summary + controls ─────────────────── */}
      <div className="print:hidden">
        <Header
          title="Print Invoices"
          subtitle={`${invoices.length} invoice${invoices.length === 1 ? '' : 's'} selected`}
          actions={
            <div className="flex items-center gap-2">
              <PrintActions label="Print All" />
              <BackButton fallbackHref={backHref} label="Receivables" />
            </div>
          }
        />
        <div className="p-6">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Selected Invoices</h3>
              <span className="text-sm font-bold text-amber-600">{formatCurrency(totalDue)} total due</span>
            </div>
            <div className="divide-y divide-slate-50">
              {invoices.map(invoice => (
                <div key={invoice.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-mono font-semibold text-slate-900">{invoice.invoice_number}</p>
                      <p className="text-xs text-slate-500">{invoice.customers?.print_name ?? invoice.customers?.full_name ?? '—'} · {formatDate(invoice.invoice_date)}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-amber-600">{formatCurrency(invoice.balance_due)}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-4">
            Use "Print All" or your browser's print dialog (Ctrl/Cmd+P) — choose "Save as PDF" to download instead of printing.
          </p>
        </div>
      </div>
    </div>
  )
}
