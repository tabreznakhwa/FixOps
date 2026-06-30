import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { Plus, MessageSquare, Filter } from 'lucide-react'
import { getPriorityColor, getStatusColor, formatStatus, formatDateTime, formatDate } from '@/lib/utils'
import { ComplaintsDateFilter } from './ComplaintsDateFilter'

export const metadata = { title: 'Complaints' }

const STATUSES = ['new', 'assigned', 'accepted', 'on_the_way', 'work_started', 'waiting_parts', 'waiting_approval', 'completed']

export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<{ status?: string; priority?: string; q?: string; from?: string; to?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('complaints')
    .select('id, complaint_number, description, priority, status, service_category, created_at, preferred_date, preferred_time, customers(full_name, mobile_number), users!complaints_assigned_to_fkey(full_name)')
    .order('created_at', { ascending: false })

  if (params.status) query = query.eq('status', params.status)
  if (params.priority) query = query.eq('priority', params.priority)
  if (params.q) query = query.ilike('description', `%${params.q}%`)
  if (params.from) query = query.gte('created_at', `${params.from}T00:00:00`)
  if (params.to) query = query.lte('created_at', `${params.to}T23:59:59`)

  const { data: complaintsRaw } = await query.limit(params.from || params.to ? 1000 : 50)
  const complaints = complaintsRaw as unknown as Array<{
    id: string; complaint_number: string; description: string; priority: string; status: string;
    service_category: string | string[]; created_at: string;
    preferred_date: string | null; preferred_time: string | null;
    customers: { full_name: string; mobile_number: string } | null;
    users: { full_name: string } | null
  }>

  const { data: countsRaw } = await supabase
    .from('complaints')
    .select('status')
    .not('status', 'in', '(cancelled,paid)')
  const counts = countsRaw as unknown as { status: string }[]

  const statusCounts: Record<string, number> = {}
  counts?.forEach((c: { status: string }) => { statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1 })

  const dateQS = [
    params.from ? `from=${params.from}` : '',
    params.to ? `to=${params.to}` : '',
  ].filter(Boolean).join('&')
  const withDate = (qs: string) => [qs, dateQS].filter(Boolean).join('&')

  const categoryIcons: Record<string, string> = {
    ac_maintenance: '❄️', plumbing: '🔧', electrical: '⚡',
    general: '🔨', emergency: '🚨', amc_visit: '📋',
    installation: '🏗️', inspection: '🔍', quotation: '📝',
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Complaints"
        subtitle="Service requests & job tracking"
        actions={
          <Link
            href="/complaints/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Complaint
          </Link>
        }
      />

      <div className="p-6 space-y-5">
        {/* Status tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Link
            href={`/complaints${dateQS ? `?${dateQS}` : ''}`}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${!params.status ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            All ({counts?.length ?? 0})
          </Link>
          {['new', 'assigned', 'accepted', 'on_the_way', 'work_started', 'waiting_parts', 'waiting_approval', 'completed'].map((s) => (
            <Link
              key={s}
              href={`/complaints?${withDate(`status=${s}`)}`}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors capitalize ${params.status === s ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {formatStatus(s)} {statusCounts[s] ? `(${statusCounts[s]})` : ''}
            </Link>
          ))}
        </div>

        {/* Date Range Filter */}
        <ComplaintsDateFilter from={params.from} to={params.to} />

        {/* Priority Filter */}
        <div className="flex gap-2">
          {['emergency', 'high', 'medium', 'low'].map((p) => (
            <Link
              key={p}
              href={params.priority === p
                ? `/complaints${params.status || dateQS ? `?${withDate(params.status ? `status=${params.status}` : '')}` : ''}`
                : `/complaints?${withDate(`priority=${p}${params.status ? `&status=${params.status}` : ''}`)}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${params.priority === p ? 'ring-2 ring-slate-900' : ''} ${getPriorityColor(p)}`}
            >
              {p === 'emergency' && '🚨 '}
              {p}
            </Link>
          ))}
        </div>

        {/* Complaints List */}
        {!complaints?.length ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No complaints found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {complaints.map((c) => {
              const customer = c.customers as { full_name: string; mobile_number: string } | null
              const assignee = c.users as { full_name: string } | null
              return (
                <Link
                  key={c.id}
                  href={`/complaints/${c.id}`}
                  className="flex items-start gap-4 bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all group"
                >
                  <div className="text-2xl flex-shrink-0 mt-0.5">
                    {categoryIcons[Array.isArray(c.service_category) ? c.service_category[0] : c.service_category] ?? '🔧'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-mono text-slate-400">{c.complaint_number}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getPriorityColor(c.priority)}`}>
                        {c.priority}
                      </span>
                      <span className="text-xs text-slate-400 capitalize">
                        {(Array.isArray(c.service_category) ? c.service_category : [c.service_category])
                          .map(s => s.replace(/_/g, ' ')).join(' · ')}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors line-clamp-1">
                      {c.description}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                      <span>👤 {customer?.full_name}</span>
                      {assignee && <span>🔧 {assignee.full_name}</span>}
                      <span>🕒 {formatDateTime(c.created_at)}</span>
                      {c.preferred_date && (
                        <span className="flex items-center gap-1 bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                          📅 {formatDate(c.preferred_date)}{c.preferred_time ? ` ${c.preferred_time}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${getStatusColor(c.status)}`}>
                      {formatStatus(c.status)}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
