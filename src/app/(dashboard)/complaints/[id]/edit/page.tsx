import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { EditComplaintForm } from './EditComplaintForm'

export const metadata = { title: 'Edit Complaint' }

export default async function EditComplaintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: complaintRaw } = await (supabase as any)
    .from('complaints')
    .select('id, complaint_number, service_category, priority, description, location, preferred_date, preferred_time, notes')
    .eq('id', id)
    .single()

  if (!complaintRaw) notFound()

  return (
    <div className="animate-fade-in">
      <Header
        title={`Edit ${complaintRaw.complaint_number}`}
        subtitle="Update complaint details"
        actions={
          <Link
            href={`/complaints/${id}`}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Cancel
          </Link>
        }
      />
      <div className="p-6 max-w-2xl">
        <EditComplaintForm complaint={complaintRaw} />
      </div>
    </div>
  )
}
