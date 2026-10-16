import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { currentPath, resolveBack } from '@/lib/backNav'
import { NewComplaintForm } from '@/components/complaints/NewComplaintForm'

export const metadata = { title: 'New Complaint' }

export default async function NewComplaintPage({
  searchParams,
}: {
  searchParams: Promise<{ customer_id?: string; return_to?: string }>
}) {
  const query = await searchParams
  const back = resolveBack(query.return_to, '/complaints', 'Back')
  const complaintCreatePath = currentPath('/complaints/new', query)
  const supabase = await createClient()

  const { data: techniciansRaw } = await supabase
    .from('users')
    .select('id, full_name')
    .eq('role', 'technician')
    .eq('status', 'active')
    .order('full_name')

  const technicians = (techniciansRaw ?? []) as { id: string; full_name: string }[]

  const { data: initialCustomerRaw } = query.customer_id
    ? await supabase
        .from('customers')
        .select('id, full_name, company_name, mobile_number, customer_code')
        .eq('id', query.customer_id)
        .maybeSingle()
    : { data: null }

  const initialCustomer = initialCustomerRaw as {
    id: string
    full_name: string
    company_name: string | null
    mobile_number: string | null
    customer_code: string
  } | null

  return (
    <div className="animate-fade-in">
      <Header
        title="New Complaint"
        subtitle="Log a new service request"
        actions={
          <BackButton href={back.href} label={back.label} />
        }
      />
      <div className="p-6 max-w-2xl">
        <NewComplaintForm
          technicians={technicians}
          initialCustomer={initialCustomer}
          destination={back.href}
          complaintCreatePath={complaintCreatePath}
        />
      </div>
    </div>
  )
}
