import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { MergeInvoiceForm } from './MergeInvoiceForm'

export const metadata = { title: 'Monthly Invoice' }

export default async function MergeInvoicePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRaw } = await (supabase as any)
    .from('users').select('role').eq('id', user.id).single()
  const userRole = (profileRaw as { role: string } | null)?.role ?? ''
  if (!['owner', 'admin', 'manager'].includes(userRole)) redirect('/finance/invoices')

  const { data: customersRaw } = await supabase
    .from('customers')
    .select('id, full_name, mobile_number, company_name')
    .eq('status', 'active')
    .order('full_name')
    .limit(5000)

  const customers = (customersRaw ?? []) as Array<{
    id: string; full_name: string; mobile_number: string | null; company_name: string | null
  }>

  return (
    <div className="animate-fade-in">
      <Header
        title="Monthly Invoice"
        subtitle="Merge multiple invoices into one consolidated invoice"
        actions={
          <BackButton fallbackHref="/finance/invoices" label="Back to Invoices" />
        }
      />
      <div className="p-6">
        <MergeInvoiceForm customers={customers} />
      </div>
    </div>
  )
}
