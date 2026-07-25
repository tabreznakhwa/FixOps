import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BackButton } from '@/components/ui/BackButton'
import { EditCustomerForm } from './EditCustomerForm'

export const metadata = { title: 'Edit Customer' }

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
          <BackButton fallbackHref={`/customers/${id}`} label="Cancel" />
        }
      />
      <div className="p-6 max-w-2xl">
        <EditCustomerForm customer={customerRaw} />
      </div>
    </div>
  )
}
