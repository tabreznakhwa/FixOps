import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { NewComplaintForm } from '@/components/complaints/NewComplaintForm'

export const metadata = { title: 'New Complaint' }

export default async function NewComplaintPage() {
  const supabase = await createClient()

  const { data: techniciansRaw } = await supabase
    .from('users')
    .select('id, full_name')
    .eq('role', 'technician')
    .eq('status', 'active')
    .order('full_name')

  const technicians = (techniciansRaw ?? []) as { id: string; full_name: string }[]

  return (
    <div className="animate-fade-in">
      <Header
        title="New Complaint"
        subtitle="Log a new service request"
        actions={
          <BackButton fallbackHref="/complaints" label="Back" />
        }
      />
      <div className="p-6 max-w-2xl">
        <NewComplaintForm technicians={technicians} />
      </div>
    </div>
  )
}
