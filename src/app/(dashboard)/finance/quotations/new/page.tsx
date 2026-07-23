import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { QuotationForm } from '../QuotationForm'

export const metadata = { title: 'New Quotation' }

export default async function NewQuotationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = user
    ? await supabase.from('users').select('role').eq('id', user.id).single()
    : { data: null }
  const role = (profileRaw as { role: string } | null)?.role ?? ''
  if (!['owner', 'admin'].includes(role)) redirect('/dashboard?error=unauthorized')

  const { data: customersRaw } = await supabase
    .from('customers')
    .select('id, full_name, mobile_number, company_name')
    .eq('status', 'active')
    .order('full_name')
    .limit(5000)

  const customers = (customersRaw ?? []) as Array<{
    id: string
    full_name: string
    mobile_number: string | null
    company_name: string | null
  }>

  return (
    <div className="animate-fade-in">
      <Header
        title="New Quotation"
        subtitle="Prepare an estimate for customer approval"
        actions={
          <Link href="/finance/quotations" className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
            <ArrowLeft className="w-4 h-4" /> Quotations
          </Link>
        }
      />
      <div className="p-6">
        <QuotationForm customers={customers} />
      </div>
    </div>
  )
}
