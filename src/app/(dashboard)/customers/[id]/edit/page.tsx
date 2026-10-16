import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { notFound } from 'next/navigation'
import { BackButton } from '@/components/ui/BackButton'
import { resolveBack } from '@/lib/backNav'
import { EditCustomerForm } from './EditCustomerForm'

export const metadata = { title: 'Edit Customer' }

export default async function EditCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ return_to?: string }>
}) {
  const { id } = await params
  const destination = resolveBack((await searchParams).return_to, `/customers/${id}`, 'Customer')
  const supabase = await createClient()

  const { data: customerRaw } = await (supabase as any)
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  if (!customerRaw) notFound()

  return (
    <div className="animate-fade-in">
      <Header
        title="Edit Customer"
        subtitle="Update customer information"
        actions={
          <BackButton href={destination.href} label="Cancel" />
        }
      />
      <div className="p-6 max-w-2xl">
        <EditCustomerForm customer={customerRaw} destination={destination.href} />
      </div>
    </div>
  )
}
