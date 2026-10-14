import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { MyLeaveDashboard } from './MyLeaveDashboard'

export const metadata = { title: 'My Leave' }

const PAGE_SIZE = 100

function parsePage(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(typeof value === 'string' ? value : '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export default async function MyLeavePage({ searchParams }: PageProps<'/my-leave'>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // The generated Database type trails several production migrations; leave
  // queries stay service-role scoped explicitly below until it is regenerated.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: profile } = await admin
    .from('users')
    .select('organization_id, role, status')
    .eq('id', user.id)
    .single()
  if (!profile || profile.status !== 'active') redirect('/login')
  if (profile.role === 'attendance_kiosk') redirect('/my-attendance')

  const params = await searchParams
  const page = parsePage(params.page)
  const offset = (page - 1) * PAGE_SIZE
  const currentYear = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' }).slice(0, 4)

  const { data: staff, error: staffError } = await admin
    .from('staff')
    .select('id, full_name, organization_id, joining_date')
    .eq('organization_id', profile.organization_id)
    .eq('user_id', user.id)
    .eq('employment_status', 'active')
    .maybeSingle()
  if (staffError) throw new Error(staffError.message)

  let applications: Array<{
    id: string
    leave_type: string
    start_date: string
    end_date: string
    requested_days: number
    reason: string
    status: string
    review_note: string | null
    reviewed_at: string | null
    created_at: string
  }> = []
  let total = 0
  let pendingTotal = 0
  let approvedThisYearTotal = 0

  if (staff) {
    const [applicationsResult, pendingResult, approvedResult] = await Promise.all([
      admin
        .from('leave_applications')
        .select('id, leave_type, start_date, end_date, requested_days, reason, status, review_note, reviewed_at, created_at', { count: 'exact' })
        .eq('organization_id', staff.organization_id)
        .eq('staff_id', staff.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1),
      admin
        .from('leave_applications')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', staff.organization_id)
        .eq('staff_id', staff.id)
        .eq('status', 'pending'),
      admin
        .from('leave_applications')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', staff.organization_id)
        .eq('staff_id', staff.id)
        .eq('status', 'approved')
        .lte('start_date', `${currentYear}-12-31`)
        .gte('end_date', `${currentYear}-01-01`),
    ])

    const loadError = applicationsResult.error ?? pendingResult.error ?? approvedResult.error
    if (loadError) throw new Error(loadError.message)
    applications = applicationsResult.data ?? []
    total = applicationsResult.count ?? 0
    pendingTotal = pendingResult.count ?? 0
    approvedThisYearTotal = approvedResult.count ?? 0
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const dataRevision = applications
    .map((application) => `${application.id}:${application.status}:${application.reviewed_at ?? ''}`)
    .join('|')
  if (total > 0 && page > totalPages) redirect(`/my-leave?page=${totalPages}`)

  return (
    <div className="animate-fade-in">
      <Header title="My Leave" subtitle="Apply for leave and track admin approval" />
      <MyLeaveDashboard
        key={`${page}:${dataRevision}`}
        staffLinked={!!staff}
        staffId={staff?.id ?? null}
        joiningDate={staff?.joining_date ?? null}
        initialApplications={applications}
        pendingTotal={pendingTotal}
        approvedThisYearTotal={approvedThisYearTotal}
        page={page}
        totalPages={totalPages}
      />
    </div>
  )
}
