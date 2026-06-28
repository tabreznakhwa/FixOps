import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency } from '@/lib/utils'
import { BarChart3, Users, Clock } from 'lucide-react'
import { WPSExportButton } from './WPSExportButton'

export const metadata = { title: 'Payroll' }

export default async function PayrollPage() {
  const supabase = await createClient()
  const admin = createAdminClient() as any

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await admin.from('users').select('organization_id').eq('id', user!.id).single()
  const orgId = (profileRaw as { organization_id: string } | null)?.organization_id

  const { data: staffRaw } = await admin
    .from('staff')
    .select('id, full_name, designation, department, basic_salary, food_allowance, other_allowance, allowance_name, fixed_overtime_monthly, overtime_eligible, overtime_rate, employment_status')
    .eq('organization_id', orgId)
    .eq('employment_status', 'active')
    .order('full_name')

  const staff = (staffRaw ?? []) as Array<{
    id: string
    full_name: string
    designation: string | null
    department: string | null
    basic_salary: number
    food_allowance: number | null
    other_allowance: number
    allowance_name: string | null
    fixed_overtime_monthly: number | null
    overtime_eligible: boolean
    overtime_rate: number | null
  }>

  const totals = staff.reduce(
    (acc, s) => ({
      basic: acc.basic + (s.basic_salary ?? 0),
      allowance: acc.allowance + (s.other_allowance ?? 0),
      food: acc.food + (s.food_allowance ?? 0),
      fixedOT: acc.fixedOT + (s.fixed_overtime_monthly ?? 0),
    }),
    { basic: 0, allowance: 0, food: 0, fixedOT: 0 },
  )

  const totalMonthlyBill = totals.basic + totals.allowance + totals.food + totals.fixedOT

  const estimatedOvertimeHours = 8
  const overtimeAccrual = staff
    .filter((s) => s.overtime_eligible && s.overtime_rate)
    .reduce((sum, s) => sum + (s.overtime_rate ?? 0) * estimatedOvertimeHours, 0)

  return (
    <div className="animate-fade-in">
      <Header
        title="Payroll"
        subtitle="Salary management & payroll processing"
        actions={<WPSExportButton />}
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center mb-3">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{staff.length}</p>
            <p className="text-sm text-slate-500 mt-0.5">Active Employees</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center mb-3">
              <BarChart3 className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(totalMonthlyBill)}</p>
            <p className="text-sm text-slate-500 mt-0.5">Total Monthly Bill</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center mb-3">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(overtimeAccrual)}</p>
            <p className="text-sm text-slate-500 mt-0.5">Est. Overtime Accrual (8h)</p>
          </div>
        </div>

        {/* Staff Payroll Table */}
        {staff.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Staff Payroll Breakdown</h3>
              <span className="text-xs text-slate-500">{staff.length} employees</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Employee</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Basic</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Allowance</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Food</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Fixed OT</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Total Monthly</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {staff.map((s) => {
                    const allowance = s.other_allowance ?? 0
                    const food = s.food_allowance ?? 0
                    const fixedOT = s.fixed_overtime_monthly ?? 0
                    const monthly = (s.basic_salary ?? 0) + allowance + food + fixedOT
                    return (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {s.full_name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{s.full_name}</p>
                              <p className="text-xs text-slate-500">{s.designation ?? s.department ?? '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right text-sm text-slate-700">{formatCurrency(s.basic_salary ?? 0)}</td>
                        <td className="px-4 py-3.5 text-right text-sm">
                          {allowance > 0 ? (
                            <div>
                              <span className="text-slate-600">{formatCurrency(allowance)}</span>
                              {s.allowance_name && s.allowance_name !== 'Allowance' && (
                                <p className="text-xs text-slate-400">{s.allowance_name}</p>
                              )}
                            </div>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-right text-sm text-slate-600">
                          {food > 0 ? formatCurrency(food) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-right text-sm text-slate-600">
                          {fixedOT > 0 ? formatCurrency(fixedOT) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <p className="text-sm font-bold text-slate-900">{formatCurrency(monthly)}</p>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td className="px-5 py-3 text-sm font-bold text-slate-700">Total</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">{formatCurrency(totals.basic)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700">{formatCurrency(totals.allowance)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700">{formatCurrency(totals.food)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700">{formatCurrency(totals.fixedOT)}</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-slate-900">{formatCurrency(totalMonthlyBill)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-3">Payroll Processing</h3>
          <p className="text-sm text-slate-500 mb-4">
            Generate payslips, process deductions, and export WPS-compliant salary files.
          </p>
          <WPSExportButton />
          <p className="text-xs text-slate-400 mt-2">WPS (Wage Protection System) export is coming soon</p>
        </div>
      </div>
    </div>
  )
}
