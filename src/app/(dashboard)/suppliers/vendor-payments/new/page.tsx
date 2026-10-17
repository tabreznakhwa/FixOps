import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { VendorPaymentForm } from './VendorPaymentForm'
import { resolveBack } from '@/lib/backNav'

export const metadata = { title: 'Record Vendor Payment' }

export default async function NewVendorPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string; supplier?: string; return_to?: string }>
}) {
  const params = await searchParams
  const back = resolveBack(params.return_to, '/suppliers/vendor-payments', 'Vendor Payments')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRaw } = await (supabase as any)
    .from('users')
    .select('organization_id, role')
    .eq('id', user.id)
    .single()
  const profile = profileRaw as { organization_id: string; role: string } | null
  if (!profile || !['owner', 'admin', 'manager', 'accounts'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const admin = createAdminClient() as any
  const [{ data: suppliersRaw }, { data: openInvoicesRaw }] = await Promise.all([
    admin
      .from('suppliers')
      .select('id, supplier_name, supplier_code')
      .eq('organization_id', profile.organization_id)
      .order('supplier_name'),
    admin
      .from('purchase_invoices')
      .select('id, invoice_number, supplier_invoice_number, supplier_id, invoice_date, balance_due, total_amount')
      .eq('organization_id', profile.organization_id)
      .gt('balance_due', 0)
      .eq('payment_type', 'credit')
      .eq('status', 'confirmed')
      .not('posting_sequence', 'is', null)
      .order('invoice_date', { ascending: true })
      .limit(1000),
  ])

  const suppliers = (suppliersRaw ?? []) as Array<{
    id: string
    supplier_name: string
    supplier_code: string
  }>
  const openInvoices = (openInvoicesRaw ?? []) as Array<{
    id: string
    invoice_number: string
    supplier_invoice_number: string | null
    supplier_id: string
    invoice_date: string
    balance_due: number
    total_amount: number
  }>

  const defaultInvoice = params.invoice
    ? openInvoices.find((invoice) => invoice.id === params.invoice) ?? null
    : null
  const defaultSupplierId = defaultInvoice?.supplier_id
    ?? (params.supplier && suppliers.some((supplier) => supplier.id === params.supplier)
      ? params.supplier
      : null)

  return (
    <div className="animate-fade-in">
      <Header
        title="Record Vendor Payment"
        subtitle="Settle one posted purchase invoice; use Supplier Advances for unallocated payments"
        actions={<BackButton href={back.href} label={back.label} />}
      />
      <div className="p-6 max-w-xl">
        <VendorPaymentForm
          suppliers={suppliers}
          openInvoices={openInvoices}
          defaultInvoiceId={defaultInvoice?.id ?? null}
          defaultSupplierId={defaultSupplierId}
          returnTo={back.href}
        />
      </div>
    </div>
  )
}
