import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NewComplaintForm } from '@/components/complaints/NewComplaintForm'

export const metadata = { title: 'New Complaint' }

export default async function NewComplaintPage() {
  const supabase = await createClient()

  const [{ data: customersRaw }, { data: techniciansRaw }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, full_name, company_name, mobile_number, customer_code')
      .eq('status', 'active')
      .order('full_name'),
    supabase
      .from('users')
      .select('id, full_name')
      .eq('role', 'technician')
      .eq('status', 'active')
      .order('full_name'),
  ])

  const customers = (customersRaw ?? []) as {
    id: string; full_name: string; company_name: string | null; mobile_number: string; customer_code: string
  }[]
  const technicians = (techniciansRaw ?? []) as { id: string; full_name: string }[]

  return (
    <div className="animate-fade-in">
      <Header
        title="New Complaint"
        subtitle="Log a new service request"
        actions={
          <Link
            href="/complaints"
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />
      <div className="p-6 max-w-2xl">
        <NewComplaintForm customers={customers} technicians={technicians} />
      </div>
    </div>
  )
}
