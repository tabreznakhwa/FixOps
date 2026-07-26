import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { PerformanceClient, type TechPerf } from './PerformanceClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Staff Performance' }

function getDateRange(period: string): { from: string | null; to: string | null } {
  const now = new Date()
  switch (period) {
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
      return { from: start.toISOString(), to: end.toISOString() }
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3)
      const start = new Date(now.getFullYear(), q * 3, 1)
      return { from: start.toISOString(), to: null }
    }
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: null }
    case 'all':
      return { from: null, to: null }
    default: // month
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: null }
  }
}

const DONE_STATUSES = new Set(['completed', 'verified', 'invoiced', 'paid'])

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const params = await searchParams
  const period = params.period ?? 'month'
  const { from, to } = getDateRange(period)

  const supabase = await createClient()

  // All active technician users
  const { data: techUsers } = await supabase
    .from('users')
    .select('id, full_name')
    .eq('role', 'technician')
    .eq('status', 'active')

  if (!techUsers || techUsers.length === 0) {
    return (
      <div className="animate-fade-in">
        <Header
          title="Staff Performance"
          subtitle="Technician KPIs & leaderboard"
          actions={<RefreshButton />}
        />
        <div className="p-6">
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500 font-medium">No active technicians found.</p>
          </div>
        </div>
      </div>
    )
  }

  const userIds = techUsers.map((u: any) => u.id)

  // Build queries with optional date range
  let complaintsQ = supabase
    .from('complaints')
    .select('id, assigned_to, status, priority')
    .in('assigned_to', userIds)
    .not('status', 'eq', 'cancelled')

  let woQ = supabase
    .from('work_orders')
    .select('id, assigned_to, final_amount, status')
    .in('assigned_to', userIds)
    .not('status', 'eq', 'cancelled')

  if (from) { complaintsQ = complaintsQ.gte('created_at', from); woQ = woQ.gte('created_at', from) }
  if (to)   { complaintsQ = complaintsQ.lte('created_at', to);  woQ = woQ.lte('created_at', to) }

  const [{ data: complaints }, { data: workOrders }] = await Promise.all([complaintsQ, woQ])

  // Invoices linked to those work orders
  const woIds = (workOrders ?? []).map((w: any) => w.id)
  const { data: invoices } = woIds.length > 0
    ? await supabase
        .from('invoices')
        .select('work_order_id, amount_paid, total_amount, status')
        .in('work_order_id', woIds)
        .not('status', 'in', '(cancelled,written_off)')
    : { data: [] }

  // Invoice lookup by WO id
  const invoiceByWO = new Map<string, { paid: number; total: number }>()
  ;(invoices ?? []).forEach((inv: any) => {
    const entry = invoiceByWO.get(inv.work_order_id) ?? { paid: 0, total: 0 }
    entry.paid += inv.amount_paid ?? 0
    entry.total += inv.total_amount ?? 0
    invoiceByWO.set(inv.work_order_id, entry)
  })

  // Aggregate per technician
  const perfMap = new Map<string, TechPerf>()
  techUsers.forEach((u: any) => {
    perfMap.set(u.id, {
      userId: u.id,
      name: u.full_name,
      totalComplaints: 0,
      completedComplaints: 0,
      activeComplaints: 0,
      emergencyCompleted: 0,
      workOrders: 0,
      revenueBilled: 0,
      revenueCollected: 0,
    })
  })

  ;(complaints ?? []).forEach((c: any) => {
    const p = perfMap.get(c.assigned_to)
    if (!p) return
    p.totalComplaints++
    if (DONE_STATUSES.has(c.status)) {
      p.completedComplaints++
      if (c.priority === 'emergency') p.emergencyCompleted++
    } else {
      p.activeComplaints++
    }
  })

  ;(workOrders ?? []).forEach((wo: any) => {
    const p = perfMap.get(wo.assigned_to)
    if (!p) return
    p.workOrders++
    p.revenueBilled += wo.final_amount ?? 0
    const inv = invoiceByWO.get(wo.id)
    if (inv) p.revenueCollected += inv.paid
  })

  const techList = Array.from(perfMap.values()).sort(
    (a, b) => b.completedComplaints - a.completedComplaints || b.revenueBilled - a.revenueBilled
  )

  return (
    <div className="animate-fade-in">
      <Header
        title="Staff Performance"
        subtitle="Technician KPIs & leaderboard"
        actions={<RefreshButton />}
      />
      <div className="p-6">
        <PerformanceClient technicians={techList} period={period} />
      </div>
    </div>
  )
}
