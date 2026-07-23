import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { QuotationForm } from '../../QuotationForm'

export const metadata = { title: 'Edit Quotation' }

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
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
    .select('*')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (!quotationRaw) notFound()

  const quotation = quotationRaw as unknown as {
    id: string
    customer_id: string
    work_order_id: string | null
    quotation_date: string
    valid_until: string | null
    status: string
    discount_amount: number
    notes: string | null
    terms_and_conditions: string | null
  }

  if (quotation.status === 'converted') redirect(`/finance/quotations/${id}`)

  const [{ data: customersRaw }, { data: itemsRaw }] = await Promise.all([
    supabase.from('customers').select('id, full_name, mobile_number, company_name').eq('status', 'active').order('full_name').limit(5000),
    admin.from('quotation_items').select('description, quantity, unit_price').eq('quotation_id', id).order('sort_order'),
  ])

  const customers = (customersRaw ?? []) as Array<{
    id: string
    full_name: string
    mobile_number: string | null
    company_name: string | null
  }>

  const items = (itemsRaw ?? []) as Array<{ description: string; quantity: number; unit_price: number }>

  return (
    <div className="animate-fade-in">
      <Header
        title="Edit Quotation"
        subtitle="Update estimate details"
        actions={
          <Link href={`/finance/quotations/${id}`} className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
            <ArrowLeft className="w-4 h-4" /> Quotation
          </Link>
        }
      />
      <div className="p-6">
        <QuotationForm customers={customers} initial={{ ...quotation, items }} />
      </div>
    </div>
  )
}
