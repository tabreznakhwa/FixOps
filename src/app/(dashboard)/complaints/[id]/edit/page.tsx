'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { EditComplaintForm } from './EditComplaintForm'

interface Complaint {
  id: string
  complaint_number: string
  service_category: string | string[]
  priority: string
  description: string
  location: string | null
  preferred_date: string | null
  preferred_time: string | null
  notes: string | null
  status: string
}

export default function EditComplaintPage() {
  const { id } = useParams<{ id: string }>()
  const [complaint, setComplaint] = useState<Complaint | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/complaints/${id}/detail`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return }
        setComplaint(data.complaint)
      })
      .catch(() => setError('Failed to load complaint'))
  }, [id])

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      </div>
    )
  }

  if (!complaint) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div>
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Edit {complaint.complaint_number}</h1>
            <p className="text-sm text-slate-500 mt-0.5">Update complaint details</p>
          </div>
          <Link
            href={`/complaints/${id}`}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Cancel
          </Link>
        </div>
      </header>
      <div className="p-6 max-w-2xl">
        <EditComplaintForm complaint={complaint} />
      </div>
    </div>
  )
}
