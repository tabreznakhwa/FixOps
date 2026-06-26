import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
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
          <Link
            href={`/customers/${id}`}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Cancel
          </Link>
        }
      />
      <div className="p-6 max-w-2xl">
        <EditCustomerForm customer={customerRaw} />
      </div>
    </div>
  )
}
