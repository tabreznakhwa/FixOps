import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { FileBarChart } from 'lucide-react'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'
import { StaffLedgerSelector } from './StaffLedgerSelector'

export const metadata = { title: 'Staff Ledger' }

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function slipDate(run: { salary_year: number; salary_month: number }): string {
  const lastDay = new Date(run.salary_year, run.salary_month, 0).getDate()
  return `${run.salary_year}-${String(run.salary_month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

export default async function StaffLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ staff_id?: string; from_date?: string; to_date?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const admin = createAdminClient() as any

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileRaw } = await (supabase as any)
    .from('users').select('organization_id, role').eq('id', user!.id).single()
  const profile = profileRaw as { organization_id: string; role: string } | null
  const orgId = profile?.organization_id

  const canView = ['owner', 'admin', 'hr', 'manager'].includes(profile?.role ?? '')

  // Fetch all staff for the selector (include former employees for ledger history)
  const { data: staffRaw } = await admin
    .from('staff')
    .select('id, full_name, staff_code, designation, department, employment_status')
    .eq('organization_id', orgId)
    .order('full_name')

  const staffListRaw = (staffRaw ?? []) as Array<{
    id: string; full_name: string; staff_code: string; designation: string | null
    department: string | null; employment_status: string
  }>
  // Active staff first
  const staffList = staffListRaw.sort((a, b) => {
    if (a.employment_status === 'active' && b.employment_status !== 'active') return -1
    if (a.employment_status !== 'active' && b.employment_status === 'active') return 1
    return a.full_name.localeCompare(b.full_name)
  })

  const staffId = params.staff_id ?? ''
  const fromDate = params.from_date ?? ''
  const toDate = params.to_date ?? ''

  type SalaryRun = { salary_month: number; salary_year: number; status: string }
  type SalarySlip = {
    id: string; gross_salary: number; advance_deduction: number; net_salary: number
    absent_deduction: number | null; food_deduction: number | null; absent_days: number | null
    deductions: number | null; payment_status: string; salary_run_id: string
    run: SalaryRun | null
  }
  type StaffAdvance = {
    id: string; type: string; amount: number; issued_date: string
    payment_method: string | null; notes: string | null
  }
  type StaffInfo = {
    full_name: string; staff_code: string; designation: string | null
    department: string | null; advance_balance: number
  }

  let staffInfo: StaffInfo | null = null
  let allSlips: SalarySlip[] = []
  let allAdvances: StaffAdvance[] = []

  if (staffId && canView) {
    const [{ data: si }, { data: runsRaw }, { data: slipsRaw }, { data: advRaw }] = await Promise.all([
      admin.from('staff').select('full_name, staff_code, designation, department, advance_balance').eq('id', staffId).single(),
      admin.from('salary_runs').select('id, salary_month, salary_year, status').eq('organization_id', orgId),
      admin.from('salary_slips')
        .select('id, gross_salary, advance_deduction, net_salary, absent_deduction, food_deduction, absent_days, deductions, payment_status, salary_run_id')
        .eq('staff_id', staffId),
      admin.from('staff_advances')
        .select('id, type, amount, issued_date, payment_method, notes')
        .eq('staff_id', staffId)
        .order('issued_date', { ascending: true }),
    ])

    staffInfo = si as StaffInfo | null

    const runsById = new Map<string, SalaryRun>(
      (runsRaw ?? []).map((r: any) => [
        r.id,
        { salary_month: r.salary_month, salary_year: r.salary_year, status: r.status },
      ]),
    )

    allSlips = (slipsRaw ?? [])
      .map((s: any) => ({ ...s, run: runsById.get(s.salary_run_id) ?? null }))
      .filter((s: any) => s.run !== null)
      .sort((a: any, b: any) =>
        a.run.salary_year !== b.run.salary_year
          ? a.run.salary_year - b.run.salary_year
          : a.run.salary_month - b.run.salary_month,
      ) as SalarySlip[]

    allAdvances = (advRaw ?? []) as StaffAdvance[]
  }

  // Apply date filters
  const filteredSlips = allSlips.filter((sl) => {
    if (!sl.run || (!fromDate && !toDate)) return !!sl.run
    const d = slipDate(sl.run)
    if (fromDate && d < fromDate) return false
    if (toDate && d > toDate) return false
    return true
  })

  const filteredAdvances = allAdvances.filter((a) => {
    if (!fromDate && !toDate) return true
    if (fromDate && a.issued_date < fromDate) return false
    if (toDate && a.issued_date > toDate) return false
    return true
  })

  // Build advance & loan ledger (chronological timeline)
  type LedgerEntry = {
    id: string; date: string; description: string
    type: 'advance' | 'loan' | 'recovery'; debit: number; credit: number; balance: number
  }

  const advanceEvents: Array<Omit<LedgerEntry, 'id' | 'balance'>> = []

  for (const a of filteredAdvances) {
    const method = a.payment_method === 'bank' ? 'Bank Transfer' : a.payment_method === 'cash' ? 'Cash' : null
    advanceEvents.push({
      date: a.issued_date,
      description: [
        a.type === 'loan' ? 'Loan Issued' : 'Advance Issued',
        method ? `(${method})` : null,
        a.notes ? `— ${a.notes}` : null,
      ].filter(Boolean).join(' '),
      type: a.type === 'loan' ? 'loan' : 'advance',
      debit: a.amount,
      credit: 0,
    })
  }

  for (const sl of filteredSlips) {
    if (!sl.run || (sl.advance_deduction ?? 0) <= 0) continue
    advanceEvents.push({
      date: slipDate(sl.run),
      description: `Advance Recovery — ${MONTHS_SHORT[sl.run.salary_month - 1]} ${sl.run.salary_year} Salary`,
      type: 'recovery',
      debit: 0,
      credit: sl.advance_deduction,
    })
  }

  advanceEvents.sort((a, b) => a.date.localeCompare(b.date))

  let running = 0
  const advanceLedger: LedgerEntry[] = advanceEvents.map((e, i) => {
    running += e.debit - e.credit
    return { ...e, id: String(i), balance: running }
  })

  // Summary stats
  const totalGross = filteredSlips.reduce((s, sl) => s + (sl.gross_salary ?? 0), 0)
  const totalNet = filteredSlips.reduce((s, sl) => s + (sl.net_salary ?? 0), 0)
  const totalAdvIssued = filteredAdvances.reduce((s, a) => s + a.amount, 0)
  const totalRecovered = filteredSlips.reduce((s, sl) => s + (sl.advance_deduction ?? 0), 0)
  const totalAbsent = filteredSlips.reduce((s, sl) => s + (sl.absent_deduction ?? 0) + (sl.food_deduction ?? 0), 0)
  const currentAdvBalance = staffInfo?.advance_balance ?? 0

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead
          title="Staff Ledger"
          subtitle={staffInfo ? `Account Statement — ${staffInfo.full_name}` : 'Account Statement'}
        />
      </div>
      <Header
        title="Staff Ledger"
        subtitle="Employee salary & advance account statement"
        actions={<PrintActions />}
      />

      <div className="p-6 space-y-5">
        {canView ? (
          <>
            <StaffLedgerSelector
              staffList={staffList}
              selectedId={staffId}
              fromDate={fromDate}
              toDate={toDate}
            />

            {staffId && !staffInfo && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                <p className="text-amber-700 font-medium">Employee not found</p>
              </div>
            )}

            {staffInfo && (
              <>
                {/* Staff banner */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {staffInfo.full_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900">{staffInfo.full_name}</p>
                    <p className="text-sm text-slate-500">
                      {staffInfo.designation ?? staffInfo.department ?? '—'}{' '}
                      · <span className="font-mono text-xs">{staffInfo.staff_code}</span>
                    </p>
                  </div>
                  {currentAdvBalance > 0 && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-slate-400">Outstanding Advance</p>
                      <p className="text-base font-bold text-amber-600">{formatCurrency(currentAdvBalance)}</p>
                    </div>
                  )}
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    {
                      label: 'Advance Outstanding',
                      value: formatCurrency(currentAdvBalance),
                      note: 'Current balance',
                      color: currentAdvBalance > 0 ? 'text-amber-700' : 'text-slate-900',
                      bg: currentAdvBalance > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200',
                    },
                    {
                      label: 'Advances / Loans',
                      value: formatCurrency(totalAdvIssued),
                      note: `${filteredAdvances.length} transaction${filteredAdvances.length !== 1 ? 's' : ''}`,
                      color: 'text-orange-700',
                      bg: 'bg-white border-slate-200',
                    },
                    {
                      label: 'Gross Salary',
                      value: formatCurrency(totalGross),
                      note: `${filteredSlips.length} payslip${filteredSlips.length !== 1 ? 's' : ''}`,
                      color: 'text-slate-900',
                      bg: 'bg-white border-slate-200',
                    },
                    {
                      label: 'Net Salary Paid',
                      value: formatCurrency(totalNet),
                      note: 'After all deductions',
                      color: 'text-green-700',
                      bg: 'bg-white border-slate-200',
                    },
                  ].map(({ label, value, note, color, bg }) => (
                    <div key={label} className={`rounded-xl border p-4 ${bg}`}>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
                      <p className={`text-xl font-bold ${color}`}>{value}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{note}</p>
                    </div>
                  ))}
                </div>

                {/* Advance & Loan Account */}
                <div>
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Advance &amp; Loan Account
                  </h2>
                  {advanceLedger.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                      <p className="text-slate-400 text-sm">
                        No advances or loans recorded{fromDate || toDate ? ' in this date range' : ''}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Date</th>
                            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Description</th>
                            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Type</th>
                            <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Issued (Dr)</th>
                            <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Recovered (Cr)</th>
                            <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {advanceLedger.map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{formatDate(row.date)}</td>
                              <td className="px-4 py-3.5">
                                <p className="font-medium text-slate-800">{row.description}</p>
                              </td>
                              <td className="px-4 py-3.5 hidden md:table-cell">
                                <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  row.type === 'advance' ? 'bg-orange-100 text-orange-700' :
                                  row.type === 'loan' ? 'bg-purple-100 text-purple-700' :
                                  'bg-green-100 text-green-700'
                                }`}>
                                  {row.type === 'recovery' ? 'Recovery' : row.type === 'loan' ? 'Loan' : 'Advance'}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-right font-semibold text-red-600">
                                {row.debit > 0 ? formatCurrency(row.debit) : '—'}
                              </td>
                              <td className="px-4 py-3.5 text-right font-semibold text-green-600">
                                {row.credit > 0 ? formatCurrency(row.credit) : '—'}
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <span className={`font-bold ${row.balance > 0 ? 'text-amber-600' : row.balance < 0 ? 'text-green-600' : 'text-slate-400'}`}>
                                  {row.balance === 0 ? 'Cleared' : formatCurrency(Math.abs(row.balance))}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-200 bg-slate-50">
                            <td colSpan={3} className="px-5 py-3.5 text-sm font-bold text-slate-700">Total</td>
                            <td className="px-4 py-3.5 text-right text-sm font-bold text-red-600">
                              {formatCurrency(advanceLedger.reduce((s, r) => s + r.debit, 0))}
                            </td>
                            <td className="px-4 py-3.5 text-right text-sm font-bold text-green-600">
                              {formatCurrency(advanceLedger.reduce((s, r) => s + r.credit, 0))}
                            </td>
                            <td className="px-5 py-3.5 text-right text-sm font-bold text-amber-600">
                              {advanceLedger[advanceLedger.length - 1]?.balance === 0
                                ? 'Cleared'
                                : formatCurrency(Math.abs(advanceLedger[advanceLedger.length - 1]?.balance ?? 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>

                {/* Salary History */}
                <div>
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Salary History
                  </h2>
                  {filteredSlips.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                      <p className="text-slate-400 text-sm">
                        No salary records{fromDate || toDate ? ' in this date range' : ''}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px]">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Period</th>
                              <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Gross</th>
                              <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Absent Deduction</th>
                              <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Advance Recovery</th>
                              <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Net Paid</th>
                              <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                              <th className="px-4 py-3" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {filteredSlips.map((sl) => {
                              const absentDeduct = (sl.absent_deduction ?? 0) + (sl.food_deduction ?? 0)
                              return (
                                <tr key={sl.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-5 py-3.5">
                                    <p className="font-semibold text-slate-900">
                                      {sl.run
                                        ? `${MONTHS_FULL[sl.run.salary_month - 1]} ${sl.run.salary_year}`
                                        : '—'}
                                    </p>
                                    {(sl.absent_days ?? 0) > 0 && (
                                      <p className="text-xs text-red-500 mt-0.5">
                                        {sl.absent_days} absent day{sl.absent_days !== 1 ? 's' : ''}
                                      </p>
                                    )}
                                  </td>
                                  <td className="px-4 py-3.5 text-right font-semibold text-slate-700">
                                    {formatCurrency(sl.gross_salary ?? 0)}
                                  </td>
                                  <td className="px-4 py-3.5 text-right hidden md:table-cell">
                                    {absentDeduct > 0 ? (
                                      <span className="font-semibold text-red-500">{formatCurrency(absentDeduct)}</span>
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3.5 text-right hidden md:table-cell">
                                    {(sl.advance_deduction ?? 0) > 0 ? (
                                      <span className="font-semibold text-orange-600">{formatCurrency(sl.advance_deduction)}</span>
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3.5 text-right">
                                    <p className="font-bold text-green-700">{formatCurrency(sl.net_salary ?? 0)}</p>
                                  </td>
                                  <td className="px-4 py-3.5 text-center">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                                      sl.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                    }`}>
                                      {sl.payment_status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 text-right">
                                    <Link
                                      href={`/payroll/slips/${sl.salary_run_id}/${staffId}?return_to=${encodeURIComponent(`/staff/ledger?staff_id=${staffId}`)}`}
                                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                      Payslip →
                                    </Link>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-200 bg-slate-50">
                              <td className="px-5 py-3.5 text-sm font-bold text-slate-700">Total</td>
                              <td className="px-4 py-3.5 text-right text-sm font-bold text-slate-900">
                                {formatCurrency(totalGross)}
                              </td>
                              <td className="px-4 py-3.5 text-right text-sm font-bold text-red-600 hidden md:table-cell">
                                {formatCurrency(totalAbsent)}
                              </td>
                              <td className="px-4 py-3.5 text-right text-sm font-bold text-orange-600 hidden md:table-cell">
                                {formatCurrency(totalRecovered)}
                              </td>
                              <td className="px-5 py-3.5 text-right text-sm font-bold text-green-700">
                                {formatCurrency(totalNet)}
                              </td>
                              <td colSpan={2} />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {!staffId && (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
                <FileBarChart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Select an employee to view their ledger</p>
                <p className="text-slate-400 text-sm mt-1">
                  Shows salary history, advances, loans, and deductions with a running balance.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-700 font-semibold">Access Denied</p>
            <p className="text-red-500 text-sm mt-1">You don&apos;t have permission to view staff ledgers.</p>
          </div>
        )}
      </div>
    </div>
  )
}
