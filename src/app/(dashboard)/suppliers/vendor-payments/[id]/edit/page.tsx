/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { notFound, redirect } from 'next/navigation'
import { EditVendorPaymentForm } from './EditVendorPaymentForm'
import { resolveBack } from '@/lib/backNav'

export const metadata = { title: 'Cancel Vendor Payment' }

export default async function EditVendorPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ return_to?: string }>
}) {
  const { id } = await params
  const { return_to } = await searchParams
  const back = resolveBack(return_to, '/suppliers/vendor-payments', 'Vendor Payments')
  const supabase = await createClient()
  const admin = createAdminClient() as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileRaw } = await (supabase as any)
    .from('users')
    .select('role, organization_id')
    .eq('id', user.id)
    .single()
  const profile = profileRaw as { role: string; organization_id: string } | null
  if (!profile || !['owner', 'admin', 'manager'].includes(profile.role)) {
    redirect('/suppliers/vendor-payments')
  }

  const { data: raw } = await admin
    .from('supplier_payments')
    .select('id, payment_date, amount_paid, discount_amount, payment_mode, reference_number, is_cancelled, is_automatic, supplier_advance_id, purchase_order_id, suppliers(supplier_name, supplier_code), purchase_invoices(invoice_number)')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (!raw) notFound()

  const payment = raw as {
    id: string
    payment_date: string
    amount_paid: number
    discount_amount: number | null
    payment_mode: string
    reference_number: string | null
    is_cancelled: boolean
    is_automatic: boolean
    supplier_advance_id: string | null
    purchase_order_id: string | null
    suppliers: { supplier_name: string; supplier_code: string } | null
    purchase_invoices: { invoice_number: string } | null
  }

  if (payment.is_cancelled || payment.is_automatic || payment.supplier_advance_id) notFound()
  if (payment.purchase_order_id) {
    return (
      <div className="animate-fade-in">
        <Header
          title="Legacy Vendor Payment"
          subtitle={payment.suppliers?.supplier_name ?? ''}
          actions={<BackButton href={back.href} label={back.label} />}
        />
        <div className="p-6 max-w-xl">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            This legacy payment is linked directly to a purchase order. Purchase orders are procurement commitments, not Accounts Payable bills, so this payment cannot be cancelled here. Reconcile it first to a posted purchase invoice or reclassify it as a supplier advance.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Cancel Vendor Payment"
        subtitle={payment.suppliers?.supplier_name ?? ''}
        actions={<BackButton href={back.href} label={back.label} />}
      />
      <div className="p-6 max-w-xl">
        <EditVendorPaymentForm payment={payment} returnTo={back.href} />
      </div>
    </div>
  )
}
