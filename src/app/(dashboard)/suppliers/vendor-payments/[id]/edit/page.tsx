import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { EditVendorPaymentForm } from './EditVendorPaymentForm'

export const metadata = { title: 'Edit Vendor Payment' }

export default async function EditVendorPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const admin = createAdminClient() as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileRaw } = await (supabase as any).from('users').select('role, organization_id').eq('id', user.id).single()
  const role = (profileRaw as { role: string } | null)?.role ?? ''
  if (!['owner', 'admin', 'manager', 'accounts'].includes(role)) redirect('/suppliers/vendor-payments')

  const { data: raw } = await admin
    .from('supplier_payments')
    .select('id, payment_date, amount_paid, discount_amount, payment_mode, reference_number, notes, suppliers(supplier_name, supplier_code), purchase_orders(po_number)')
    .eq('id', id)
    .single()

  if (!raw) notFound()

  const payment = raw as {
    id: string; payment_date: string; amount_paid: number; discount_amount: number | null
    payment_mode: string; reference_number: string | null; notes: string | null
    suppliers: { supplier_name: string; supplier_code: string } | null
    purchase_orders: { po_number: string } | null
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Edit Vendor Payment"
        subtitle={payment.suppliers?.supplier_name ?? ''}
        actions={
          <Link href="/suppliers/vendor-payments" className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />
      <div className="p-6 max-w-xl">
        <EditVendorPaymentForm payment={payment} />
      </div>
    </div>
  )
}
