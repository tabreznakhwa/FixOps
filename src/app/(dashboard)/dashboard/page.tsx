import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { DashboardStats } from '@/components/dashboard/DashboardStats'
import { RevenueChart } from '@/components/dashboard/RevenueChart'
import { ComplaintStatusChart } from '@/components/dashboard/ComplaintStatusChart'
import { RecentComplaints } from '@/components/dashboard/RecentComplaints'
import { TechnicianWorkload } from '@/components/dashboard/TechnicianWorkload'
import { LowStockAlert } from '@/components/dashboard/LowStockAlert'
import { formatDate } from '@/lib/utils'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()

  const today = new Date().toISOString().split('T')[0]
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

  const [
    { count: totalComplaints },
    { count: openComplaints },
    { count: emergencyComplaints },
    { count: completedToday },
    { data: revenueData },
    { data: complaintStatusData },
    { data: recentComplaints },
    { data: technicianUsers },
    { data: technicianStaff },
    { data: lowStockItems },
    { data: receivablesData },
  ] = await Promise.all([
    supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('complaints').select('*', { count: 'exact', head: true }).not('status', 'in', '(completed,verified,invoiced,paid,cancelled)'),
    supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('priority', 'emergency').not('status', 'in', '(completed,cancelled)'),
    supabase.from('work_orders').select('*', { count: 'exact', head: true }).eq('status', 'completed').gte('updated_at', today),
    supabase.from('invoices').select('invoice_date, total_amount, amount_paid').gte('invoice_date', monthStart).not('status', 'in', '(cancelled,written_off)').order('invoice_date'),
    supabase.from('complaints').select('status').not('status', 'in', '(cancelled)'),
    supabase.from('complaints').select('id, complaint_number, description, priority, status, created_at, customers(full_name)').order('created_at', { ascending: false }).limit(8),
    supabase.from('users').select('id, full_name').eq('role', 'technician').eq('status', 'active'),
    supabase.from('staff').select('id, full_name').eq('employment_status', 'active'),
    supabase.from('inventory_items').select('id, item_name, current_stock, minimum_stock_level, unit_of_measure').filter('current_stock', 'lte', 'minimum_stock_level').eq('is_active', true).limit(5),
    supabase.from('invoices').select('balance_due, status').in('status', ['issued', 'partial', 'overdue']),
  ])

  type RevRow = { invoice_date: string; total_amount: number; amount_paid: number }
  type StatusRow = { status: string }
  type RecRow = { balance_due: number; status: string }
  type TechRow = { id: string; full_name: string }
  const technicianData: TechRow[] = [
    ...((technicianUsers as unknown as TechRow[]) ?? []),
    ...((technicianStaff as unknown as TechRow[]) ?? []),
  ]
  type StockRow = { id: string; item_name: string; current_stock: number; minimum_stock_level: number; unit_of_measure: string }

  const rev = (revenueData as unknown as RevRow[]) ?? []
  const statusRows = (complaintStatusData as unknown as StatusRow[]) ?? []
  const recRows = (receivablesData as unknown as RecRow[]) ?? []

  const totalReceivables = recRows.reduce((sum, i) => sum + (i.balance_due ?? 0), 0)
  const monthRevenue = rev.reduce((sum, i) => sum + (i.total_amount ?? 0), 0)
  const monthCollected = rev.reduce((sum, i) => sum + (i.amount_paid ?? 0), 0)

  // Build complaint status breakdown
  const statusCounts: Record<string, number> = {}
  statusRows.forEach((c) => {
    statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1
  })

  return (
    <div className="animate-fade-in">
      <Header
        title="Dashboard"
        subtitle={`Today, ${formatDate(new Date().toISOString())}`}
      />

      <div className="p-6 space-y-6">
        {/* KPI Cards */}
        <DashboardStats
          stats={{
            newComplaints: totalComplaints ?? 0,
            openComplaints: openComplaints ?? 0,
            emergencyComplaints: emergencyComplaints ?? 0,
            completedToday: completedToday ?? 0,
            monthRevenue,
            monthCollected,
            totalReceivables,
            lowStockCount: (lowStockItems as unknown as StockRow[])?.length ?? 0,
          }}
        />

        {/* Charts Row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <RevenueChart data={rev} />
          </div>
          <ComplaintStatusChart statusCounts={statusCounts} />
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <RecentComplaints complaints={(recentComplaints as unknown as Parameters<typeof RecentComplaints>[0]['complaints']) ?? []} />
          </div>
          <div className="space-y-6">
            <TechnicianWorkload technicians={(technicianData as unknown as TechRow[]) ?? []} />
            <LowStockAlert items={(lowStockItems as unknown as StockRow[]) ?? []} />
          </div>
        </div>
      </div>
    </div>
  )
}
