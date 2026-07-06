import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Printer, FileText } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export const metadata = { title: 'My Payslips' }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const STATUS_COLOR: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  draft: 'bg-slate-100 text-slate-600',
}

export default async function MyPayslipsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRaw } = await (supabase as any)
    .from('users').select('organization_id, role').eq('id', user.id).single()
  const profile = profileRaw as { organization_id: string; role: string } | null
  if (!profile || profile.role !== 'attendance_kiosk') redirect('/attendance')

  const admin = createAdminClient() as any

  const { data: staffRaw } = await admin
    .from('staff').select('id, full_name, staff_code, designation').eq('user_id', user.id).maybeSingle()
  const staff = staffRaw as { id: string; full_name: string; staff_code: string; designation: string | null } | null

  if (!staff) {
    return (
      <div className="animate-fade-in">
        <Header title="My Payslips" subtitle="Your salary history" />
        <div className="p-6">
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No staff profile linked</p>
            <p className="text-sm text-slate-400 mt-1">Ask HR to link your account to your staff record to view payslips.</p>
          </div>
        </div>
      </div>
    )
  }

  // Get all salary slips for this staff member with their run info
  const { data: slipsRaw } = await admin
    .from('salary_slips')
    .select('id, salary_run_id, net_salary, gross_salary, payment_status, basic_salary, overtime_amount, normal_overtime, friday_overtime, absent_days, absent_deduction, advance_deduction')
    .eq('staff_id', staff.id)

  const slips = (slipsRaw ?? []) as Array<{
    id: string; salary_run_id: string; net_salary: number; gross_salary: number
    payment_status: string; basic_salary: number; overtime_amount: number | null
    normal_overtime: number | null; friday_overtime: number | null
    absent_days: number | null; absent_deduction: number | null; advance_deduction: number | null
  }>

  // Get run info for each slip
  const runIds = slips.map(s => s.salary_run_id)
  const runsMap: Record<string, { salary_month: number; salary_year: number; status: string }> = {}
  if (runIds.length > 0) {
    const { data: runsRaw } = await admin
      .from('salary_runs')
      .select('id, salary_month, salary_year, status')
      .in('id', runIds)
      .eq('organization_id', profile.organization_id)
    for (const r of (runsRaw ?? [])) {
      runsMap[r.id] = r
    }
  }

  // Sort slips by year desc, month desc
  const sortedSlips = slips
    .map(s => ({ ...s, run: runsMap[s.salary_run_id] }))
    .filter(s => s.run)
    .sort((a, b) => {
      if (b.run.salary_year !== a.run.salary_year) return b.run.salary_year - a.run.salary_year
      return b.run.salary_month - a.run.salary_month
    })

  return (
    <div className="animate-fade-in">
      <Header
        title="My Payslips"
        subtitle={`Salary history for ${staff.full_name}`}
      />
      <div className="p-6 space-y-5">
        {/* Staff info card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
              {staff.full_name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-slate-900">{staff.full_name}</p>
              <p className="text-sm text-slate-500">{staff.designation ?? staff.staff_code}</p>
            </div>
          </div>
        </div>

        {sortedSlips.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No payslips found</p>
            <p className="text-sm text-slate-400 mt-1">Payslips will appear here once payroll is processed.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Period</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Gross</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Deductions</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Net Pay</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sortedSlips.map((s) => {
                  const totalDeductions = (s.absent_deduction ?? 0) + (s.advance_deduction ?? 0)
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-slate-900">
                          {MONTHS[s.run.salary_month - 1]} {s.run.salary_year}
                        </p>
                        <p className="text-xs text-slate-400 capitalize">{s.run.status}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm text-slate-700">
                        {formatCurrency(s.gross_salary)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm">
                        {totalDeductions > 0
                          ? <span className="text-red-600">−{formatCurrency(totalDeductions)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-sm font-bold text-slate-900">{formatCurrency(s.net_salary)}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[s.payment_status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {s.payment_status === 'paid' ? 'Paid' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/payroll/slips/${s.salary_run_id}/${staff.id}`}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5" /> View Payslip
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
