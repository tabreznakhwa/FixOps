import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { Suspense } from 'react'
import { Plus, MessageSquare, UserPlus } from 'lucide-react'
import { getPriorityColor, getStatusColor, formatStatus, formatDateTime, formatDate } from '@/lib/utils'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { ComplaintSearchBar } from './ComplaintSearchBar'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Complaints' }


export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<{ status?: string; priority?: string; q?: string; from?: string; to?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = user
    ? await (supabase as any).from('users').select('role').eq('id', user.id).single()
    : { data: null }
  const role = (profileRaw as { role: string } | null)?.role ?? ''
  const isTechnician = role === 'technician'

  let query = supabase
    .from('complaints')
    .select('id, complaint_number, description, priority, status, service_category, created_at, preferred_date, preferred_time, customer_id, visit_order, customers(full_name, mobile_number), users!complaints_assigned_to_fkey(full_name)')

  if (isTechnician) {
    query = (query as any).order('visit_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
  } else {
    query = (query as any).order('complaint_number', { ascending: false })
  }

  if (params.status) query = query.eq('status', params.status)
  if (params.priority) query = query.eq('priority', params.priority)
  if (params.from) query = query.gte('preferred_date', params.from)
  if (params.to) query = query.lte('preferred_date', params.to)

  if (params.q) {
    const q = params.q.trim()
    const { data: matchedCustomers } = await supabase
      .from('customers').select('id').ilike('full_name', `%${q}%`)
    const customerIds = (matchedCustomers ?? []).map((c: { id: string }) => c.id)
    if (customerIds.length > 0) {
      query = query.or(`description.ilike.%${q}%,complaint_number.ilike.%${q}%,customer_id.in.(${customerIds.join(',')})`)
    } else {
      query = query.or(`description.ilike.%${q}%,complaint_number.ilike.%${q}%`)
    }
  }

  const { data: complaintsRaw } = await query.limit(params.from || params.to ? 1000 : 50)
  let complaints = complaintsRaw as unknown as Array<{
    id: string; complaint_number: string; description: string; priority: string; status: string;
    service_category: string | string[]; created_at: string;
    preferred_date: string | null; preferred_time: string | null;
    customer_id: string | null; visit_order: number | null;
    customers: { full_name: string; mobile_number: string } | null;
    users: { full_name: string } | null
  }>

  if (isTechnician && complaints) {
    complaints = [...complaints].sort((a, b) => {
      const aCompleted = a.status === 'completed' ? 1 : 0
      const bCompleted = b.status === 'completed' ? 1 : 0
      if (aCompleted !== bCompleted) return aCompleted - bCompleted
      if (a.visit_order == null && b.visit_order == null) return 0
      if (a.visit_order == null) return 1
      if (b.visit_order == null) return -1
      return a.visit_order - b.visit_order
    })
  }

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
          <div className="flex items-center gap-2">
            <Suspense fallback={<div className="w-60 h-9 bg-slate-100 rounded-lg animate-pulse" />}>
              <ComplaintSearchBar />
            </Suspense>
            <Link
              href="/customers/new"
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
            >
              <UserPlus className="w-4 h-4" /> New Customer
            </Link>
            <Link
              href="/complaints/new"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> New Complaint
            </Link>
          </div>
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

        {/* Date Range Filter — filters by preferred/assigned date */}
        <DateRangeFilter basePath="/complaints" from={params.from} to={params.to} label="Assigned Date" />

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
                  <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-0.5">
                    <div className="text-2xl">
                      {categoryIcons[Array.isArray(c.service_category) ? c.service_category[0] : c.service_category ?? ''] ?? '🔧'}
                    </div>
                    {isTechnician && c.visit_order != null && (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-[11px] font-bold">
                        {c.visit_order}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-mono text-slate-400">{c.complaint_number}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getPriorityColor(c.priority)}`}>
                        {c.priority}
                      </span>
                      <span className="text-xs text-slate-400 capitalize">
                        {(Array.isArray(c.service_category) ? c.service_category : [c.service_category ?? ''])
                          .filter(Boolean).map((s: string) => s.replace(/_/g, ' ')).join(' · ')}
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
