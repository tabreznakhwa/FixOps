import { createAdminClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { PrintButton } from './PrintButton'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default async function PayslipPage({ params }: { params: Promise<{ runId: string; staffId: string }> }) {
  const { runId, staffId } = await params
  const admin = createAdminClient() as any

  const { data: runRaw } = await admin
    .from('salary_runs')
    .select('salary_month, salary_year, status')
    .eq('id', runId)
    .single()
  const run = runRaw as { salary_month: number; salary_year: number; status: string } | null

  const { data: slipRaw } = await admin
    .from('salary_slips')
    .select('*')
    .eq('salary_run_id', runId)
    .eq('staff_id', staffId)
    .maybeSingle()
  const slip = slipRaw as {
    basic_salary: number; housing_allowance: number; transport_allowance: number
    food_allowance: number | null; other_allowance: number; allowance_name: string | null
    overtime_amount: number; normal_overtime: number | null; friday_overtime: number | null
    gross_salary: number; deductions: number; advance_deduction: number; net_salary: number
    absent_days: number | null; absent_deduction: number | null; food_deduction: number | null
    payment_status: string; payment_date: string | null; payment_mode: string | null
  } | null

  const { data: staffRaw } = await admin
    .from('staff')
    .select('staff_code, full_name, designation, department, joining_date, bank_name, iban, emirates_id')
    .eq('id', staffId)
    .maybeSingle()
  const staff = staffRaw as {
    staff_code: string; full_name: string; designation: string | null; department: string | null
    joining_date: string; bank_name: string | null; iban: string | null; emirates_id: string | null
  } | null

  if (!run || !slip || !staff) {
    return (
      <div className="animate-fade-in p-6">
        <div className="print:hidden mb-4">
          <Link href="/payroll/process"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Payslips
          </Link>
        </div>
        <div className="max-w-md bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-base font-semibold text-amber-800 mb-2">Payslip not found</p>
          <p className="text-sm text-amber-700">
            {!run && 'The salary run could not be found.'}
            {run && !staff && 'The staff record could not be found.'}
            {run && staff && !slip && 'No payslip was generated for this employee in this run. Please re-process payroll for this month.'}
          </p>
        </div>
      </div>
    )
  }

  const { data: orgRaw } = await admin
    .from('organizations')
    .select('name, address, phone, email')
    .limit(1).single()
  const org = (orgRaw ?? {}) as { name: string; address: string | null; phone: string | null; email: string | null }

  const monthLabel = `${MONTHS[run.salary_month - 1]} ${run.salary_year}`
  const allowanceName = slip.allowance_name ?? 'Allowance'

  // Earnings: allowance = housing(0) + transport(0) + other
  const allowance = (slip.housing_allowance ?? 0) + (slip.transport_allowance ?? 0) + (slip.other_allowance ?? 0)
  const absentDays = slip.absent_days ?? 0
  const absentDeduction = slip.absent_deduction ?? 0
  const foodDeduction = slip.food_deduction ?? 0

  const earnings = [
    { label: 'Basic', amount: slip.basic_salary },
    { label: allowanceName, amount: allowance },
    { label: 'Food Allowance', amount: slip.food_allowance ?? 0 },
    { label: 'Fixed Over Time', amount: slip.overtime_amount ?? 0 },
    { label: 'Normal Overtime', amount: slip.normal_overtime ?? 0 },
    { label: 'Friday Overtime', amount: slip.friday_overtime ?? 0 },
  ].filter((e) => e.amount > 0)

  // Fetch current advance balance
  const { data: staffBalanceRaw } = await admin
    .from('staff').select('advance_balance').eq('id', staffId).maybeSingle()
  const remainingAdvance = (staffBalanceRaw as { advance_balance: number | null } | null)?.advance_balance ?? 0

  const deductions = [
    ...(absentDeduction > 0 ? [{
      label: `Absent ${absentDays} Day${absentDays !== 1 ? 's' : ''} (Basic + ${allowanceName} + Fixed OT)`,
      amount: absentDeduction,
    }] : []),
    ...(foodDeduction > 0 ? [{ label: `Food Deduction (${absentDays} Day${absentDays !== 1 ? 's' : ''})`, amount: foodDeduction }] : []),
    ...(slip.advance_deduction > 0 ? [{ label: 'Advance Recovery', amount: slip.advance_deduction }] : []),
  ]
  const totalDeductionsAmt = absentDeduction + foodDeduction + (slip.advance_deduction ?? 0)

  return (
    <div className="animate-fade-in">
      <div className="print:hidden p-6 flex items-center gap-3">
        <Link href={`/payroll/process`}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Payslips
        </Link>
        <PrintButton />
      </div>

      <div className="max-w-2xl mx-auto p-6 print:p-0 print:max-w-none">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden print:border-0 print:rounded-none">
          {/* Header */}
          <div className="bg-slate-900 text-white px-8 py-6 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold">{org.name}</h1>
              {org.address && <p className="text-slate-400 text-sm mt-0.5">{org.address}</p>}
              {org.phone && <p className="text-slate-400 text-sm">{org.phone}</p>}
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Pay Slip</p>
              <p className="text-lg font-bold text-white mt-1">{monthLabel}</p>
            </div>
          </div>

          {/* Employee info */}
          <div className="px-8 py-5 bg-slate-50 border-b border-slate-200">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Employee</p>
                <p className="text-base font-bold text-slate-900">{staff.full_name}</p>
                <p className="text-sm text-slate-500">{staff.designation ?? staff.department ?? '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Staff ID</p>
                <p className="text-base font-semibold text-slate-900 font-mono">{staff.staff_code}</p>
                <p className="text-sm text-slate-500">Joined: {staff.joining_date ? new Date(staff.joining_date).toLocaleDateString('en-GB') : '—'}</p>
              </div>
            </div>
            {absentDays > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 px-3 py-1 rounded-full">
                  ⚠️ Absent: {absentDays} day{absentDays !== 1 ? 's' : ''} — Deduction: {formatCurrency(absentDeduction + foodDeduction)}
                </span>
              </div>
            )}
          </div>

          {/* Earnings & Deductions */}
          <div className="px-8 py-6 grid grid-cols-2 gap-8">
            {/* Earnings */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100">Earnings</h3>
              <div className="space-y-2">
                {earnings.map((e) => (
                  <div key={e.label} className="flex justify-between text-sm">
                    <span className="text-slate-600">{e.label}</span>
                    <span className="font-semibold text-slate-800">{formatCurrency(e.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-sm font-bold">
                <span className="text-slate-700">Gross Salary</span>
                <span className="text-slate-900">{formatCurrency(slip.gross_salary)}</span>
              </div>
            </div>

            {/* Deductions */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100">Deductions</h3>
              {deductions.length === 0 ? (
                <p className="text-sm text-slate-400">No deductions</p>
              ) : (
                <div className="space-y-2">
                  {deductions.map((d) => (
                    <div key={d.label} className="flex justify-between text-sm">
                      <span className="text-slate-600 text-xs leading-tight max-w-[140px]">{d.label}</span>
                      <span className="font-semibold text-red-600 flex-shrink-0 ml-2">{formatCurrency(d.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-sm font-bold">
                <span className="text-slate-700">Total Deductions</span>
                <span className="text-red-600">{formatCurrency(totalDeductionsAmt)}</span>
              </div>
              {slip.advance_deduction > 0 && (
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>Advance balance remaining</span>
                  <span className={remainingAdvance > 0 ? 'font-semibold text-amber-600' : 'font-semibold text-green-600'}>
                    {remainingAdvance > 0 ? formatCurrency(remainingAdvance) : 'Cleared'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Net pay */}
          <div className="mx-6 mb-6 bg-blue-600 rounded-xl px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-sm font-medium">Net Salary Payable</p>
              <p className="text-white text-xs mt-0.5">{monthLabel}</p>
            </div>
            <p className="text-white text-2xl font-bold">{formatCurrency(slip.net_salary)}</p>
          </div>

          {/* Bank info */}
          {(staff.bank_name || staff.iban) && (
            <div className="px-8 py-4 border-t border-slate-100 flex items-center gap-8 text-sm">
              {staff.bank_name && (
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Bank</p>
                  <p className="font-semibold text-slate-800">{staff.bank_name}</p>
                </div>
              )}
              {staff.iban && (
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">IBAN</p>
                  <p className="font-semibold text-slate-800 font-mono">{staff.iban}</p>
                </div>
              )}
              <div className="ml-auto text-right">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Status</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${slip.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {slip.payment_status}
                </span>
              </div>
            </div>
          )}

          <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>This is a computer-generated payslip and does not require a signature.</span>
            <span>{new Date().toLocaleDateString('en-GB')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
