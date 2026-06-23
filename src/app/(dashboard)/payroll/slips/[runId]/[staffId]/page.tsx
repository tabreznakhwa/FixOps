import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { PrintButton } from './PrintButton'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default async function PayslipPage({ params }: { params: Promise<{ runId: string; staffId: string }> }) {
  const { runId, staffId } = await params
  const supabase = await createClient()

  const { data: runRaw } = await (supabase as any)
    .from('salary_runs')
    .select('salary_month, salary_year, status')
    .eq('id', runId)
    .single()
  const run = runRaw as { salary_month: number; salary_year: number; status: string } | null

  const { data: slipRaw } = await (supabase as any)
    .from('salary_slips')
    .select('*')
    .eq('salary_run_id', runId)
    .eq('staff_id', staffId)
    .maybeSingle()
  const slip = slipRaw as {
    basic_salary: number; housing_allowance: number; transport_allowance: number
    other_allowance: number; overtime_amount: number; gross_salary: number
    deductions: number; advance_deduction: number; net_salary: number
    payment_status: string; payment_date: string | null; payment_mode: string | null
  } | null

  const { data: staffRaw } = await (supabase as any)
    .from('staff')
    .select('staff_code, full_name, designation, department, joining_date, bank_name, iban, emirates_id')
    .eq('id', staffId)
    .maybeSingle()
  const staff = staffRaw as {
    staff_code: string; full_name: string; designation: string | null; department: string | null
    joining_date: string; bank_name: string | null; iban: string | null; emirates_id: string | null
  } | null

  // Show a meaningful error instead of a blank page
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

  const { data: orgRaw } = await (supabase as any)
    .from('organizations')
    .select('name, address, phone, email')
    .limit(1).single()
  const org = (orgRaw ?? {}) as { name: string; address: string | null; phone: string | null; email: string | null }

  const monthLabel = `${MONTHS[run.salary_month - 1]} ${run.salary_year}`

  const earnings = [
    { label: 'Basic Salary', amount: slip.basic_salary },
    { label: 'Housing Allowance', amount: slip.housing_allowance },
    { label: 'Transport Allowance', amount: slip.transport_allowance },
    { label: 'Other Allowance', amount: slip.other_allowance },
    ...(slip.overtime_amount > 0 ? [{ label: 'Overtime (Fixed)', amount: slip.overtime_amount }] : []),
  ].filter((e) => e.amount > 0)

  const deductions = [
    ...(slip.deductions > 0 ? [{ label: 'Deductions', amount: slip.deductions }] : []),
    ...(slip.advance_deduction > 0 ? [{ label: 'Advance Recovery', amount: slip.advance_deduction }] : []),
  ]

  return (
    <div className="animate-fade-in">
      {/* Screen nav — hidden on print */}
      <div className="print:hidden p-6 flex items-center gap-3">
        <Link href={`/payroll/process`}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Payslips
        </Link>
        <PrintButton />
      </div>

      {/* Payslip — printable */}
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
                      <span className="text-slate-600">{d.label}</span>
                      <span className="font-semibold text-red-600">{formatCurrency(d.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-sm font-bold">
                <span className="text-slate-700">Total Deductions</span>
                <span className="text-red-600">{formatCurrency((slip.deductions ?? 0) + (slip.advance_deduction ?? 0))}</span>
              </div>
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

          {/* Footer */}
          <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>This is a computer-generated payslip and does not require a signature.</span>
            <span>{new Date().toLocaleDateString('en-GB')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
