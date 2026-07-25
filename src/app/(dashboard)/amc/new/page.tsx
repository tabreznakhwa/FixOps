import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { NewAMCForm } from './NewAMCForm'

export const metadata = { title: 'New AMC Contract' }

export default async function NewAMCPage() {
  const supabase = await createClient()

  const { data: customersRaw } = await supabase
    .from('customers')
    .select('id, full_name, company_name, mobile_number')
    .eq('status', 'active')
    .order('full_name')
    .limit(5000)

  const customers = (customersRaw ?? []) as unknown as Array<{
    id: string
    full_name: string
    company_name: string | null
    mobile_number: string
  }>

  return (
    <div className="animate-fade-in">
      <Header
        title="New AMC Contract"
        subtitle="Create an annual maintenance contract"
        actions={
          <BackButton fallbackHref="/amc" label="Back" />
        }
      />
      <div className="p-6">
        <NewAMCForm customers={customers} />
      </div>
    </div>
  )
}
