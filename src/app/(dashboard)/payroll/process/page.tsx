import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'
import { PayrollEntryForm } from './PayrollEntryForm'
import { PaySalariesButton } from './PaySalariesButton'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'

export const metadata = { title: 'Payslips' }

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export default async function PayrollProcessPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const params = await searchParams
  const nowKuwait = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuwait' })
  const now = new Date(nowKuwait)
  const month = parseInt(params.month ?? String(now.getMonth() + 1))
  const year = parseInt(params.year ?? String(now.getFullYear()))

  const supabase = await createClient()
  const admin = createAdminClient() as any

  // Check if a run exists for this month/year
  const { data: runRaw } = await (supabase as any)
    .from('salary_runs')
    .select('id, status, total_basic, total_allowances, total_overtime, total_deductions, total_net, processed_at')
    .eq('salary_month', month)
    .eq('salary_year', year)
    .single()

  const run = runRaw as {
    id: string; status: string; total_basic: number; total_allowances: number
    total_overtime: number; total_deductions: number; total_net: number; processed_at: string
  } | null

  // Staff list — use * so optional columns (food_allowance, fixed_overtime_monthly) don't break if not yet migrated
  const { data: staffRaw } = await (supabase as any)
    .from('staff')
    .select('*')
    .eq('employment_status', 'active')
    .order('full_name')

  // Attendance for this month — count absent and half_day per staff
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const { data: attendanceRaw } = await admin
    .from('attendance')
    .select('staff_id, status')
    .gte('date', startDate)
    .lte('date', endDate)

  // Build absent-day count per staff: absent=1, half_day=0.5
  const absentDaysMap: Record<string, number> = {}
  for (const rec of (attendanceRaw ?? []) as Array<{ staff_id: string; status: string }>) {
    if (rec.status === 'absent') {
      absentDaysMap[rec.staff_id] = (absentDaysMap[rec.staff_id] ?? 0) + 1
    } else if (rec.status === 'half_day') {
      absentDaysMap[rec.staff_id] = (absentDaysMap[rec.staff_id] ?? 0) + 0.5
    }
  }

  const staff = (staffRaw ?? []) as Array<{
    id: string; staff_code: string; full_name: string; designation: string | null; department: string | null
    basic_salary: number; housing_allowance: number; transport_allowance: number
    food_allowance: number | null; other_allowance: number; allowance_name: string | null
    fixed_overtime_monthly: number | null; advance_balance: number | null
    overtime_eligible: boolean; bank_name: string | null; iban: string | null
  }>

  // If run exists, load slips
  let slips: Array<{
    id: string; staff_id: string; basic_salary: number; housing_allowance: number
    transport_allowance: number; other_allowance: number; overtime_amount: number
    gross_salary: number; deductions: number; advance_deduction: number; net_salary: number
    payment_status: string
  }> = []

  if (run) {
    const { data: slipsRaw } = await (supabase as any)
      .from('salary_slips')
      .select('*')
      .eq('salary_run_id', run.id)
    slips = slipsRaw ?? []
  }

  // Build preview rows
  const rows = staff.map((s) => {
    const slip = slips.find((sl) => sl.staff_id === s.id)
    const allowances = (s.housing_allowance ?? 0) + (s.transport_allowance ?? 0) + (s.food_allowance ?? 0) + (s.other_allowance ?? 0)
    const overtime = slip?.overtime_amount ?? s.fixed_overtime_monthly ?? 0
    const gross = (s.basic_salary ?? 0) + allowances + overtime
    return {
      ...s,
      slip,
      allowances,
      overtime,
      gross,
      net: slip?.net_salary ?? gross,
    }
  })

  const totalNet = rows.reduce((s, r) => s + r.net, 0)

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead title={`Payroll — ${MONTHS[month - 1]} ${year}`} subtitle="Salary Summary" />
      </div>
      {(() => {
        const pendingCount = slips.filter(s => s.payment_status === 'pending').length
        const totalNet = slips.filter(s => s.payment_status === 'pending').reduce((sum, s) => sum + s.net_salary, 0)
        return (
          <Header
            title="Payslips"
            subtitle={`${MONTHS[month - 1]} ${year}`}
            actions={
              <div className="flex items-center gap-2">
                {run && pendingCount > 0 && (
                  <PaySalariesButton runId={run.id} pendingCount={pendingCount} totalNet={totalNet} />
                )}
                <PrintActions label="Print Summary" />
                <Link href="/payroll" className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Payroll
                </Link>
              </div>
            }
          />
        )
      })()}

      <div className="p-6 space-y-5">
        {/* Month/Year selector */}
        <form method="get" className="flex items-center gap-3 flex-wrap bg-white border border-slate-200 rounded-xl p-4">
          <select name="month" defaultValue={month}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select name="year" defaultValue={year}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="submit" className="px-4 py-2 bg-slate-700 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors">
            Load
          </button>
          {run && (
            <span className={`ml-auto text-xs font-semibold px-3 py-1.5 rounded-full capitalize ${
              run.status === 'approved' ? 'bg-green-100 text-green-700' :
              run.status === 'paid' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {run.status} run
            </span>
          )}
        </form>

        {!run && (
          <PayrollEntryForm month={month} year={year} staff={staff} absentDaysMap={absentDaysMap} />
        )}

        {run && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Basic Salary', value: run.total_basic },
              { label: 'Allowances', value: run.total_allowances },
              { label: 'Overtime', value: run.total_overtime },
              { label: 'Net Payable', value: run.total_net },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{s.label}</p>
                <p className="text-lg font-bold text-slate-900">{formatCurrency(s.value)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Staff payslip table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Employee Payslips — {MONTHS[month - 1]} {year}</h3>
            <span className="text-xs text-slate-500">{staff.length} employees · Total {formatCurrency(totalNet)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Employee</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Basic</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Allowances</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">OT</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Deductions</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Net</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Payslip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {r.full_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{r.full_name}</p>
                          <p className="text-xs text-slate-500">{r.designation ?? r.department ?? r.staff_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm text-slate-700">{formatCurrency(r.basic_salary ?? 0)}</td>
                    <td className="px-4 py-3.5 text-right text-sm text-slate-600">{formatCurrency(r.allowances)}</td>
                    <td className="px-4 py-3.5 text-right text-sm text-amber-700">
                      {r.overtime > 0 ? formatCurrency(r.overtime) : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm text-red-600">
                      {r.slip?.deductions || r.slip?.advance_deduction
                        ? formatCurrency((r.slip.deductions ?? 0) + (r.slip.advance_deduction ?? 0))
                        : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm font-bold text-slate-900">{formatCurrency(r.net)}</td>
                    <td className="px-5 py-3.5 text-center">
                      {run && r.slip ? (
                        <Link
                          href={`/payroll/slips/${run.id}/${r.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5" /> Print
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
