import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { RefreshButton } from '@/components/ui/RefreshButton'
import Link from 'next/link'
import { Suspense } from 'react'
import { Plus, UserPlus } from 'lucide-react'
import { getPriorityColor, formatStatus } from '@/lib/utils'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { ComplaintSearchBar } from './ComplaintSearchBar'
import { ComplaintList, type ComplaintListItem } from './ComplaintList'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Complaints' }


export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<{ status?: string; priority?: string; q?: string; from?: string; to?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = user
    ? await supabase.from('users').select('role').eq('id', user.id).single()
    : { data: null }
  const role = (profileRaw as { role: string } | null)?.role ?? ''
  const isTechnician = role === 'technician'
  const canReorder = ['owner', 'admin', 'manager'].includes(role)

  let query = supabase
    .from('complaints')
    .select('id, complaint_number, description, priority, status, service_category, created_at, preferred_date, preferred_time, customer_id, visit_order, customers(full_name, mobile_number), users!complaints_assigned_to_fkey(full_name)')

  if (isTechnician) {
    query = query.order('visit_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
  } else {
    query = query.order('complaint_number', { ascending: false })
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
  let complaints = complaintsRaw as unknown as ComplaintListItem[]

  // Fetch internal notes count and work orders count for each complaint
  if (complaints && complaints.length > 0) {
    const complaintIds = complaints.map(c => c.id)
    const [notesRes, woRes] = await Promise.all([
      supabase
        .from('complaint_internal_notes')
        .select('complaint_id', { count: 'exact', head: true })
        .in('complaint_id', complaintIds),
      supabase
        .from('work_orders')
        .select('id, complaint_id, status', { head: false })
        .in('complaint_id', complaintIds),
    ])

    const notesCounts: Record<string, number> = {}
    const workOrdersMap: Record<string, string[]> = {}

    if (notesRes.data) {
      complaintIds.forEach(id => {
        const count = (notesRes.data as any[])?.filter((n: any) => n.complaint_id === id).length ?? 0
        notesCounts[id] = count
      })
    }

    if (woRes.data) {
      (woRes.data as any[]).forEach(wo => {
        if (!workOrdersMap[wo.complaint_id]) workOrdersMap[wo.complaint_id] = []
        workOrdersMap[wo.complaint_id].push(wo.status)
      })
    }

    complaints = complaints.map(c => ({
      ...c,
      internalNotesCount: notesCounts[c.id] ?? 0,
      workOrdersStatuses: workOrdersMap[c.id] ?? [],
    }))
  }

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

  return (
    <div className="animate-fade-in">
      <Header
        title="Complaints"
        subtitle="Service requests & job tracking"
        actions={
          <div className="flex items-center gap-2">
            <RefreshButton />
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
        <ComplaintList
          key={complaints.map(c => `${c.id}:${c.status}:${c.visit_order ?? ''}`).join('|')}
          complaints={complaints ?? []}
          isTechnician={isTechnician}
          canReorder={canReorder}
        />
      </div>
    </div>
  )
}
