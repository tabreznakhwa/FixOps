import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { EditPurchaseInvoiceForm } from './EditPurchaseInvoiceForm'

export const metadata = { title: 'Edit Purchase Invoice' }

export default async function EditPurchaseInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient() as any

  const { data: invoiceRaw } = await admin
    .from('purchase_invoices')
    .select('id, invoice_number, invoice_date, due_date, payment_type, payment_mode, payment_status, notes, status, supplier_name, suppliers(supplier_name)')
    .eq('id', id)
    .single()

  if (!invoiceRaw) notFound()

  const invoice = invoiceRaw as {
    id: string; invoice_number: string; supplier_name: string | null
    invoice_date: string; due_date: string | null; payment_type: string
    payment_mode: string | null; payment_status: string; notes: string | null; status: string
    suppliers: { supplier_name: string } | null
  }

  if (invoice.status === 'cancelled') notFound()

  const supplierDisplay = invoice.suppliers?.supplier_name ?? invoice.supplier_name ?? '—'

  return (
    <div className="animate-fade-in">
      <Header
        title={`Edit ${invoice.invoice_number}`}
        subtitle={`Supplier: ${supplierDisplay}`}
        actions={
          <Link href={`/inventory/purchase-invoices/${id}`}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
            <ArrowLeft className="w-4 h-4" /> Cancel
          </Link>
        }
      />
      <div className="p-6 max-w-xl">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-xs text-slate-400 mb-4">
            Only invoice metadata can be edited. Items and totals cannot be changed after creation.
          </p>
          <EditPurchaseInvoiceForm invoice={invoice} />
        </div>
      </div>
    </div>
  )
}
