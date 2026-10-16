import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { notFound } from 'next/navigation'
import { BackButton } from '@/components/ui/BackButton'
import { EditAMCForm } from './EditAMCForm'
import { fetchAllCustomers } from '@/lib/customers'
import { resolveBack } from '@/lib/backNav'

export const metadata = { title: 'Edit AMC Contract' }

export default async function EditAMCPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ return_to?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const back = resolveBack(query.return_to, `/amc/${id}`, 'AMC Contract')
  const supabase = await createClient()

  const [{ data: contractRaw }, customersRaw] = await Promise.all([
    supabase
      .from('amc_contracts')
      .select('id, contract_number, contract_type, start_date, end_date, contract_amount, billing_frequency, services_included, visits_included, parts_included, payment_terms, status, renewal_reminder_date, notes, customer_id')
      .eq('id', id)
      .single(),
    fetchAllCustomers(supabase, 'id, full_name, company_name, mobile_number'),
  ])

  if (!contractRaw) notFound()

  const contract = contractRaw as unknown as {
    id: string; contract_number: string; contract_type: string | null
    start_date: string; end_date: string; contract_amount: number
    billing_frequency: string; services_included: string[]
    visits_included: number; parts_included: boolean; payment_terms: number
    status: string; renewal_reminder_date: string | null; notes: string | null
    customer_id: string
  }

  const customers = (customersRaw ?? []) as Array<{
    id: string; full_name: string; company_name: string | null; mobile_number: string
  }>

  return (
    <div className="animate-fade-in">
      <Header
        title={`Edit ${contract.contract_number}`}
        subtitle="Update AMC contract details"
        actions={
          <BackButton href={back.href} label={back.label} />
        }
      />
      <div className="p-6">
        <EditAMCForm
          contractId={id}
          returnTo={back.href}
          customers={customers}
          defaults={{
            customer_id: contract.customer_id,
            contract_type: contract.contract_type,
            start_date: contract.start_date,
            end_date: contract.end_date,
            contract_amount: contract.contract_amount,
            billing_frequency: contract.billing_frequency,
            services_included: contract.services_included ?? [],
            visits_included: contract.visits_included,
            parts_included: contract.parts_included,
            payment_terms: contract.payment_terms,
            notes: contract.notes,
            renewal_reminder_date: contract.renewal_reminder_date,
          }}
        />
      </div>
    </div>
  )
}
