import Link from 'next/link'
import { getPriorityColor, getStatusColor, formatStatus, formatDateTime } from '@/lib/utils'
import { ArrowRight } from 'lucide-react'

interface Complaint {
  id: string
  complaint_number: string
  description: string
  priority: string
  status: string
  created_at: string
  customers: { full_name: string } | null
}

export function RecentComplaints({ complaints }: { complaints: Complaint[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h3 className="font-semibold text-slate-900">Recent Complaints</h3>
          <p className="text-sm text-slate-500">Latest service requests</p>
        </div>
        <Link href="/complaints" className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium">
          View all <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {complaints.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-sm">No complaints yet</div>
      ) : (
        <div className="divide-y divide-slate-50">
          {complaints.map((c) => (
            <Link key={c.id} href={`/complaints/${c.id}`} className="flex items-start gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-slate-400">{c.complaint_number}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getPriorityColor(c.priority)}`}>
                    {c.priority}
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-700 transition-colors">
                  {c.description}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {c.customers?.full_name} · {formatDateTime(c.created_at)}
                </p>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${getStatusColor(c.status)}`}>
                {formatStatus(c.status)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
