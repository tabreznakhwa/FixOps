import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { ADMIN_LEAVE_ROLES } from '@/lib/leave'
import { LeaveApplicationsList } from './LeaveApplicationsList'

export const metadata = { title: 'Leave Approvals' }

const PAGE_SIZE = 100

function parsePage(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(typeof value === 'string' ? value : '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function parseStatus(value: string | string[] | undefined) {
  return ['pending', 'approved', 'rejected', 'cancelled', 'all'].includes(typeof value === 'string' ? value : '')
    ? value as 'pending' | 'approved' | 'rejected' | 'cancelled' | 'all'
    : 'pending'
}

export default async function LeaveApplicationsPage({ searchParams }: PageProps<'/leave-applications'>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: profile } = await admin
    .from('users')
    .select('organization_id, role, status')
    .eq('id', user.id)
    .single()

  if (!profile || profile.status !== 'active') redirect('/login')
  if (!ADMIN_LEAVE_ROLES.includes(profile.role)) redirect('/dashboard?error=unauthorized')

  const params = await searchParams
  const statusFilter = parseStatus(params.status)
  const searchQuery = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : ''
  const pendingPage = parsePage(params.pending_page)
  const historyPage = parsePage(params.page)
  const pendingOffset = (pendingPage - 1) * PAGE_SIZE
  const historyOffset = (historyPage - 1) * PAGE_SIZE
  const matchedStaffIds: string[] = []
  if (searchQuery) {
    const escapedSearch = searchQuery.replace(/[%,()]/g, '')
    const staffPageSize = 1000
    for (let from = 0; ; from += staffPageSize) {
      const { data: matchedStaff, error: matchedStaffError } = await admin
        .from('staff')
        .select('id')
        .eq('organization_id', profile.organization_id)
        .or(`full_name.ilike.%${escapedSearch}%,staff_code.ilike.%${escapedSearch}%`)
        .range(from, from + staffPageSize - 1)
      if (matchedStaffError) throw new Error(matchedStaffError.message)
      matchedStaffIds.push(...(matchedStaff ?? []).map((employee: { id: string }) => employee.id))
      if ((matchedStaff?.length ?? 0) < staffPageSize) break
    }
  }

  // PostgREST's fluent builder type is lost through the optional filter helper.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applySearch = (query: any) => {
    if (!searchQuery) return query
    const escapedReason = searchQuery.replace(/[%,()]/g, '')
    if (matchedStaffIds.length > 0) {
      return query.or(`reason.ilike.%${escapedReason}%,staff_id.in.(${matchedStaffIds.join(',')})`)
    }
    return query.ilike('reason', `%${escapedReason}%`)
  }
  const pendingQuery = applySearch(admin
    .from('leave_applications')
    .select('id, leave_type, start_date, end_date, requested_days, reason, status, review_note, reviewed_at, created_at, staff:staff!leave_applications_org_staff_fkey(id, staff_code, full_name), reviewer:users!leave_applications_org_reviewer_fkey(full_name)')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'pending'))
  const pendingCountQuery = applySearch(admin
    .from('leave_applications')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', profile.organization_id)
    .eq('status', 'pending'))
  let historyQuery = applySearch(admin
    .from('leave_applications')
    .select('id, leave_type, start_date, end_date, requested_days, reason, status, review_note, reviewed_at, created_at, staff:staff!leave_applications_org_staff_fkey(id, staff_code, full_name), reviewer:users!leave_applications_org_reviewer_fkey(full_name)', { count: 'exact' })
    .eq('organization_id', profile.organization_id)
    .neq('status', 'pending'))
  if (statusFilter !== 'pending' && statusFilter !== 'all') {
    historyQuery = historyQuery.eq('status', statusFilter)
  }

  const [pendingResult, pendingCountResult, historyResult, approvedCountResult, sickPendingCountResult] = await Promise.all([
    pendingQuery
      .order('created_at', { ascending: true })
      .range(pendingOffset, pendingOffset + PAGE_SIZE - 1),
    pendingCountQuery,
    historyQuery
      .order('created_at', { ascending: false })
      .range(historyOffset, historyOffset + PAGE_SIZE - 1),
    admin
      .from('leave_applications')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)
      .eq('status', 'approved'),
    admin
      .from('leave_applications')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)
      .eq('status', 'pending')
      .eq('leave_type', 'sick_leave'),
  ])

  const loadError = pendingResult.error
    ?? pendingCountResult.error
    ?? historyResult.error
    ?? approvedCountResult.error
    ?? sickPendingCountResult.error
  if (loadError) throw new Error(loadError.message)

  const pendingData = pendingResult.data ?? []
  const historyData = historyResult.data ?? []
  const pendingTotal = pendingCountResult.count ?? 0
  const pendingPages = Math.max(1, Math.ceil(pendingTotal / PAGE_SIZE))
  const historyTotal = historyResult.count ?? 0
  const historyPages = Math.max(1, Math.ceil(historyTotal / PAGE_SIZE))
  const dataRevision = [...pendingData, ...historyData]
    .map((application) => `${application.id}:${application.status}:${application.reviewed_at ?? ''}`)
    .join('|')
  if (pendingTotal > 0 && pendingPage > pendingPages) {
    const next = new URLSearchParams()
    next.set('pending_page', String(pendingPages))
    if (historyPage > 1) next.set('page', String(historyPage))
    if (statusFilter !== 'pending') next.set('status', statusFilter)
    if (searchQuery) next.set('q', searchQuery)
    redirect(`/leave-applications?${next}`)
  }
  if (historyTotal > 0 && historyPage > historyPages) {
    const next = new URLSearchParams()
    next.set('page', String(historyPages))
    if (pendingPage > 1) next.set('pending_page', String(pendingPage))
    if (statusFilter !== 'pending') next.set('status', statusFilter)
    if (searchQuery) next.set('q', searchQuery)
    redirect(`/leave-applications?${next}`)
  }

  return (
    <div className="animate-fade-in">
      <Header title="Leave Approvals" subtitle="Review employee annual, sick and compensation leave applications" />
      <LeaveApplicationsList
        key={`${statusFilter}:${searchQuery}:${pendingPage}:${historyPage}:${dataRevision}`}
        initialApplications={[...pendingData, ...historyData]}
        pendingPage={pendingPage}
        pendingPages={pendingPages}
        historyPage={historyPage}
        historyPages={historyPages}
        historyTotal={historyTotal}
        pendingTotal={pendingTotal}
        approvedTotal={approvedCountResult.count ?? 0}
        sickPendingTotal={sickPendingCountResult.count ?? 0}
        initialStatusFilter={statusFilter}
        initialQuery={searchQuery}
      />
    </div>
  )
}
