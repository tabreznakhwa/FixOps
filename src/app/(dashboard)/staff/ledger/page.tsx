import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthedProfile } from '@/lib/auth/session'
import { Header } from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { AlertTriangle, FileBarChart } from 'lucide-react'
import { OrgLetterhead } from '@/components/print/OrgLetterhead'
import { PrintActions } from '@/components/print/PrintActions'
import { StaffLedgerSelector } from './StaffLedgerSelector'
import { currentPath, withReturnTo, type SearchParamValue } from '@/lib/backNav'
import {
  advanceBalancesReconcile,
  buildStaffAdvanceLedger,
  type StaffAdvanceEvent,
} from './staffLedger'
import { resolveLedgerDateRange } from '@/lib/ledgerDateRange'

export const metadata = { title: 'Staff Ledger' }

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const LEDGER_ROLES = ['owner', 'admin', 'hr', 'manager']
const PAGE_SIZE = 1000
const MAX_ROWS = 50_000

type PageResult<T> = {
  data: T[] | null
  error: { message?: string } | null
}

async function fetchAllPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = []

  try {
    for (let from = 0; from <= MAX_ROWS; from += PAGE_SIZE) {
      const { data, error } = await loadPage(from, from + PAGE_SIZE - 1)
      if (error) return { rows, error: error.message ?? 'Query failed' }
      const page = data ?? []
      if (from === MAX_ROWS) {
        return page.length > 0
          ? { rows, error: `History exceeds the ${MAX_ROWS.toLocaleString()}-row safety limit` }
          : { rows, error: null }
      }
      rows.push(...page)
      if (page.length < PAGE_SIZE) return { rows, error: null }
    }
    return { rows, error: null }
  } catch (error) {
    return { rows, error: error instanceof Error ? error.message : 'Query failed' }
  }
}

function slipDate(run: { salary_year: number; salary_month: number }): string {
  const lastDay = new Date(run.salary_year, run.salary_month, 0).getDate()
  return `${run.salary_year}-${String(run.salary_month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

function recoveryDate(run: {
  salary_year: number
  salary_month: number
  processed_at: string | null
}): string {
  // Processing is when the canonical advance balance changes. Legacy runs may
  // lack the timestamp, so retain the former salary-period-end convention.
  return run.processed_at?.slice(0, 10) || slipDate(run)
}

function displayPaymentMethod(value: string | null): string | null {
  if (!value) return null
  if (value === 'bank' || value === 'bank_transfer') return 'Bank Transfer'
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function balanceLabel(balance: number): string {
  return Math.abs(balance) < 0.005 ? 'Cleared' : formatCurrency(Math.abs(balance))
}

function balanceColor(balance: number): string {
  if (balance > 0.005) return 'text-amber-600'
  if (balance < -0.005) return 'text-green-600'
  return 'text-slate-400'
}

export default async function StaffLedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>
}) {
  const params = await searchParams
  const ledgerPath = currentPath('/staff/ledger', params)
  const { profile } = await getAuthedProfile()
  if (!profile?.organization_id || profile.status !== 'active') redirect('/login')
  if (!LEDGER_ROLES.includes(profile.role)) redirect('/dashboard?error=unauthorized')

  const orgId = profile.organization_id
  // The generated Database type trails payroll and advance tables.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const staffId = typeof params.staff_id === 'string' ? params.staff_id : ''
  const { fromDate, toDate, error: dateRangeError } = resolveLedgerDateRange(
    params.from_date,
    params.to_date,
  )
  const failedSources: string[] = []

  // Fetch all staff for the selector (include former employees for ledger history).
  const staffResult = await fetchAllPages<{
    id: string; full_name: string; staff_code: string; designation: string | null
    department: string | null; employment_status: string
  }>((from, to) => admin
    .from('staff')
    .select('id, full_name, staff_code, designation, department, employment_status')
    .eq('organization_id', orgId)
    .order('employment_status')
    .order('full_name')
    .order('id')
    .range(from, to))
  if (staffResult.error) failedSources.push(`staff list: ${staffResult.error}`)

  // Active staff first, with ID as a final deterministic tie-breaker.
  const staffList = staffResult.rows.sort((a, b) => {
    if (a.employment_status === 'active' && b.employment_status !== 'active') return -1
    if (a.employment_status !== 'active' && b.employment_status === 'active') return 1
    return a.full_name.localeCompare(b.full_name) || a.id.localeCompare(b.id)
  })
  type SalaryRun = {
    id: string; salary_month: number; salary_year: number; status: string
    processed_at: string | null
  }
  type SalarySlipRow = {
    id: string; gross_salary: number; advance_deduction: number; net_salary: number
    absent_deduction: number | null; food_deduction: number | null; absent_days: number | null
    deductions: number | null; payment_status: string; salary_run_id: string
  }
  type SalarySlip = SalarySlipRow & { run: SalaryRun }
  type StaffAdvance = {
    id: string; type: string; amount: number; issued_date: string
    payment_method: string | null; notes: string | null
  }
  type StaffRepayment = {
    id: string; amount: number; repayment_date: string
    payment_method: string | null; notes: string | null
  }
  type StaffBonus = {
    id: string; bonus_date: string; amount: number; payment_mode: string; notes: string | null
  }
  type StaffInfo = {
    id: string; full_name: string; staff_code: string; designation: string | null
    department: string | null; opening_advance: number | null; opening_loan: number | null
    advance_balance: number | null
  }

  let staffInfo: StaffInfo | null = null
  let allSlips: SalarySlip[] = []
  let allAdvances: StaffAdvance[] = []
  let allRepayments: StaffRepayment[] = []
  let allBonuses: StaffBonus[] = []
  let selectedStaffLookupFailed = false

  // Resolve the URL-supplied ID independently from the selector so a selector
  // query failure cannot turn a valid employee into a misleading not-found state.
  if (staffId) {
    const staffInfoResult = await admin
      .from('staff')
      .select('id, full_name, staff_code, designation, department, opening_advance, opening_loan, advance_balance')
      .eq('organization_id', orgId)
      .eq('id', staffId)
      .maybeSingle()

    if (staffInfoResult.error) {
      selectedStaffLookupFailed = true
      failedSources.push(`employee details: ${staffInfoResult.error.message}`)
    } else {
      staffInfo = staffInfoResult.data as StaffInfo | null
    }
  }

  // Every service-role history query carries both tenant and subject scope.
  if (staffInfo) {
    const [runResult, slipResult, advanceResult, repaymentResult, bonusResult] = await Promise.all([
      fetchAllPages<SalaryRun>((from, to) => admin
        .from('salary_runs')
        .select('id, salary_month, salary_year, status, processed_at')
        .eq('organization_id', orgId)
        .order('salary_year')
        .order('salary_month')
        .order('id')
        .range(from, to)),
      fetchAllPages<SalarySlipRow>((from, to) => admin
        .from('salary_slips')
        .select('id, gross_salary, advance_deduction, net_salary, absent_deduction, food_deduction, absent_days, deductions, payment_status, salary_run_id')
        .eq('organization_id', orgId)
        .eq('staff_id', staffId)
        .order('salary_run_id')
        .order('id')
        .range(from, to)),
      fetchAllPages<StaffAdvance>((from, to) => admin
        .from('staff_advances')
        .select('id, type, amount, issued_date, payment_method, notes')
        .eq('organization_id', orgId)
        .eq('staff_id', staffId)
        .order('issued_date')
        .order('id')
        .range(from, to)),
      fetchAllPages<StaffRepayment>((from, to) => admin
        .from('staff_advance_repayments')
        .select('id, amount, repayment_date, payment_method, notes')
        .eq('organization_id', orgId)
        .eq('staff_id', staffId)
        .order('repayment_date')
        .order('id')
        .range(from, to)),
      fetchAllPages<StaffBonus>((from, to) => admin
        .from('staff_bonuses')
        .select('id, bonus_date, amount, payment_mode, notes')
        .eq('organization_id', orgId)
        .eq('staff_id', staffId)
        .eq('is_voided', false)
        .order('bonus_date')
        .order('id')
        .range(from, to)),
    ])

    if (runResult.error) failedSources.push(`salary runs: ${runResult.error}`)
    if (slipResult.error) failedSources.push(`salary slips: ${slipResult.error}`)
    if (advanceResult.error) failedSources.push(`advances and loans: ${advanceResult.error}`)
    if (repaymentResult.error) failedSources.push(`repayments: ${repaymentResult.error}`)
    if (bonusResult.error) failedSources.push(`bonuses: ${bonusResult.error}`)

    const runsById = new Map(runResult.rows.map((run) => [run.id, run]))
    allSlips = slipResult.rows
      .map((slip) => {
        const run = runsById.get(slip.salary_run_id)
        return run ? { ...slip, run } : null
      })
      .filter((slip): slip is SalarySlip => slip !== null)
      .sort((a, b) => (
        a.run.salary_year - b.run.salary_year
        || a.run.salary_month - b.run.salary_month
        || a.id.localeCompare(b.id)
      ))
    if (allSlips.length !== slipResult.rows.length) {
      failedSources.push('salary history: one or more salary runs could not be matched')
    }
    allAdvances = advanceResult.rows
    allRepayments = repaymentResult.rows
    allBonuses = bonusResult.rows
  }

  // Salary and bonus displays intentionally remain period-filtered after full
  // histories are loaded. Advance history stays complete until reconstruction.
  const filteredSlips = allSlips.filter((slip) => {
    const date = slipDate(slip.run)
    return (!fromDate || date >= fromDate) && (!toDate || date <= toDate)
  })
  const filteredBonuses = allBonuses.filter((bonus) => (
    (!fromDate || bonus.bonus_date >= fromDate) && (!toDate || bonus.bonus_date <= toDate)
  ))

  const advanceEvents: StaffAdvanceEvent[] = [
    ...allAdvances.map((advance) => {
      const method = displayPaymentMethod(advance.payment_method)
      return {
        source: 'advance_issue' as const,
        sourceId: advance.id,
        date: advance.issued_date,
        description: [
          advance.type === 'loan' ? 'Loan Issued' : 'Advance Issued',
          method ? `(${method})` : null,
          advance.notes ? `— ${advance.notes}` : null,
        ].filter(Boolean).join(' '),
        type: advance.type === 'loan' ? 'loan' as const : 'advance' as const,
        debit: Number(advance.amount ?? 0),
        credit: 0,
      }
    }),
    ...allSlips
      .filter((slip) => Number(slip.advance_deduction ?? 0) > 0)
      .map((slip) => ({
        source: 'salary_recovery' as const,
        sourceId: slip.id,
        date: recoveryDate(slip.run),
        description: `Advance Recovery — ${MONTHS_SHORT[slip.run.salary_month - 1]} ${slip.run.salary_year} Salary`,
        type: 'recovery' as const,
        debit: 0,
        credit: Number(slip.advance_deduction ?? 0),
      })),
    ...allRepayments.map((repayment) => {
      const method = displayPaymentMethod(repayment.payment_method)
      return {
        source: 'repayment' as const,
        sourceId: repayment.id,
        date: repayment.repayment_date,
        description: [
          'Repayment',
          method ? `(${method})` : null,
          repayment.notes ? `— ${repayment.notes}` : null,
        ].filter(Boolean).join(' '),
        type: 'repayment' as const,
        debit: 0,
        credit: Number(repayment.amount ?? 0),
      }
    }),
  ]

  const advanceLedger = buildStaffAdvanceLedger(advanceEvents, {
    openingAdvance: staffInfo?.opening_advance,
    openingLoan: staffInfo?.opening_loan,
    from: fromDate,
    to: toDate,
  })

  // Summary stats
  const totalGross = filteredSlips.reduce((sum, slip) => sum + Number(slip.gross_salary ?? 0), 0)
  const totalNet = filteredSlips.reduce((sum, slip) => sum + Number(slip.net_salary ?? 0), 0)
  const totalRecovered = filteredSlips.reduce((sum, slip) => sum + Number(slip.advance_deduction ?? 0), 0)
  const totalAbsent = filteredSlips.reduce(
    (sum, slip) => sum + Number(slip.absent_deduction ?? 0) + Number(slip.food_deduction ?? 0),
    0,
  )
  const totalBonus = filteredBonuses.reduce((sum, bonus) => sum + Number(bonus.amount ?? 0), 0)
  const currentAdvBalance = Number(staffInfo?.advance_balance ?? 0)
  const hasPeriodFilter = Boolean(fromDate || toDate)
  const balanceHistoryComplete = Boolean(staffInfo)
    && !failedSources.some((source) => (
      source.startsWith('salary runs:')
      || source.startsWith('salary slips:')
      || source.startsWith('salary history:')
      || source.startsWith('advances and loans:')
      || source.startsWith('repayments:')
    ))
  const balancesMatch = advanceBalancesReconcile(advanceLedger.calculatedCurrentBalance, currentAdvBalance)

  return (
    <div className="animate-fade-in">
      <div className="hidden print:block px-8 pt-8">
        <OrgLetterhead
          title="Staff Ledger"
          subtitle={staffInfo
            ? `Account Statement — ${staffInfo.full_name}${hasPeriodFilter ? ` — ${fromDate || 'Beginning'} to ${toDate || 'Present'}` : ''}`
            : 'Account Statement'}
        />
      </div>
      <div className="print:hidden">
        <Header
          title="Staff Ledger"
          subtitle="Employee salary & advance account statement"
          actions={<PrintActions />}
        />
      </div>

      <div className="p-6 space-y-5">
        <StaffLedgerSelector
          staffList={staffList}
          selectedId={staffId}
          fromDate={fromDate}
          toDate={toDate}
        />

        {dateRangeError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 print:hidden">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p className="text-sm font-medium">{dateRangeError}</p>
            </div>
          </div>
        )}

        {failedSources.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold">This statement is incomplete</p>
                <p className="mt-0.5 text-xs">
                  Could not load {failedSources.join('; ')}. Totals should not be relied on until the data reloads successfully.
                </p>
              </div>
            </div>
          </div>
        )}

        {staffId && !staffInfo && !selectedStaffLookupFailed && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <p className="text-amber-700 font-medium">Employee not found</p>
          </div>
        )}

        {staffInfo && (
              <>
                {/* Staff banner */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-4">
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
                  <div className="flex flex-wrap items-start gap-8 text-right">
                    {hasPeriodFilter && (
                      <div>
                        <p className="text-xs text-slate-400">Selected Period Closing</p>
                        <p className={`text-base font-bold ${balanceColor(advanceLedger.periodClosingBalance)}`}>
                          {balanceLabel(advanceLedger.periodClosingBalance)}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-slate-400">Current Outstanding (Canonical)</p>
                      <p className={`text-base font-bold ${balanceColor(currentAdvBalance)}`}>
                        {balanceLabel(currentAdvBalance)}
                      </p>
                    </div>
                  </div>
                </div>

                {balanceHistoryComplete && !balancesMatch && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">Advance balance needs reconciliation</p>
                        <p className="mt-0.5 text-xs">
                          The complete ledger calculates {formatCurrency(advanceLedger.calculatedCurrentBalance)}, but the staff record stores {formatCurrency(currentAdvBalance)} as the current outstanding balance. Refresh once; if the difference persists, investigate the balance history.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    {
                      label: 'Current Outstanding',
                      value: balanceLabel(currentAdvBalance),
                      note: 'Canonical staff balance',
                      color: balanceColor(currentAdvBalance),
                      bg: currentAdvBalance > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200',
                    },
                    {
                      label: hasPeriodFilter ? 'Period Closing' : 'Calculated Closing',
                      value: balanceLabel(hasPeriodFilter ? advanceLedger.periodClosingBalance : advanceLedger.calculatedCurrentBalance),
                      note: hasPeriodFilter ? 'Selected date range' : 'Opening + full history',
                      color: balanceColor(hasPeriodFilter ? advanceLedger.periodClosingBalance : advanceLedger.calculatedCurrentBalance),
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
                      label: 'Net Salary',
                      value: formatCurrency(totalNet),
                      note: 'Selected period',
                      color: 'text-green-700',
                      bg: 'bg-white border-slate-200',
                    },
                    {
                      label: 'Bonuses Paid',
                      value: formatCurrency(totalBonus),
                      note: `${filteredBonuses.length} bonus${filteredBonuses.length !== 1 ? 'es' : ''}`,
                      color: 'text-purple-700',
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
                  <div className="print-statement bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-sm">
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
                          {fromDate && (
                            <tr className="bg-blue-50">
                              <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">
                                {advanceLedger.periodOpeningDate ? formatDate(advanceLedger.periodOpeningDate) : '—'}
                              </td>
                              <td className="px-4 py-3.5 font-semibold text-blue-700">Opening Balance b/f</td>
                              <td className="px-4 py-3.5 hidden md:table-cell">
                                <span className="inline-flex text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Balance b/f</span>
                              </td>
                              <td className="px-4 py-3.5 text-right font-semibold text-red-600">—</td>
                              <td className="px-4 py-3.5 text-right font-semibold text-green-600">—</td>
                              <td className={`px-5 py-3.5 text-right font-bold ${balanceColor(advanceLedger.periodOpeningBalance)}`}>
                                {balanceLabel(advanceLedger.periodOpeningBalance)}
                              </td>
                            </tr>
                          )}
                          {!fromDate && advanceLedger.openingBase !== 0 && (
                            <tr className="bg-blue-50">
                              <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">—</td>
                              <td className="px-4 py-3.5">
                                <p className="font-semibold text-blue-700">Opening Advance / Loan</p>
                                <p className="mt-0.5 text-xs text-blue-600">
                                  Advance {formatCurrency(Number(staffInfo.opening_advance ?? 0))} · Loan {formatCurrency(Number(staffInfo.opening_loan ?? 0))}
                                </p>
                              </td>
                              <td className="px-4 py-3.5 hidden md:table-cell">
                                <span className="inline-flex text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Opening</span>
                              </td>
                              <td className="px-4 py-3.5 text-right font-semibold text-red-600">{formatCurrency(advanceLedger.openingBase)}</td>
                              <td className="px-4 py-3.5 text-right font-semibold text-green-600">—</td>
                              <td className={`px-5 py-3.5 text-right font-bold ${balanceColor(advanceLedger.openingBase)}`}>
                                {balanceLabel(advanceLedger.openingBase)}
                              </td>
                            </tr>
                          )}
                          {advanceLedger.rows.map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{formatDate(row.date)}</td>
                              <td className="px-4 py-3.5">
                                <p className="font-medium text-slate-800">{row.description}</p>
                              </td>
                              <td className="px-4 py-3.5 hidden md:table-cell">
                                <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  row.type === 'advance' ? 'bg-orange-100 text-orange-700' :
                                  row.type === 'loan' ? 'bg-purple-100 text-purple-700' :
                                  row.type === 'repayment' ? 'bg-teal-100 text-teal-700' :
                                  'bg-green-100 text-green-700'
                                }`}>
                                  {row.type === 'recovery' ? 'Recovery' : row.type === 'repayment' ? 'Repayment' : row.type === 'loan' ? 'Loan' : 'Advance'}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-right font-semibold text-red-600">
                                {row.debit > 0 ? formatCurrency(row.debit) : '—'}
                              </td>
                              <td className="px-4 py-3.5 text-right font-semibold text-green-600">
                                {row.credit > 0 ? formatCurrency(row.credit) : '—'}
                              </td>
                              <td className={`px-5 py-3.5 text-right font-bold ${balanceColor(row.balance)}`}>
                                {balanceLabel(row.balance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-200 bg-slate-50">
                            <td colSpan={3} className="px-5 py-3.5 text-sm font-bold text-slate-700">
                              {hasPeriodFilter ? 'Period Totals' : 'Total'}
                            </td>
                            <td className="px-4 py-3.5 text-right text-sm font-bold text-red-600">
                              {formatCurrency(hasPeriodFilter ? advanceLedger.periodDebit : advanceLedger.allTimeDebit)}
                            </td>
                            <td className="px-4 py-3.5 text-right text-sm font-bold text-green-600">
                              {formatCurrency(hasPeriodFilter ? advanceLedger.periodCredit : advanceLedger.allTimeCredit)}
                            </td>
                            <td className={`px-5 py-3.5 text-right text-sm font-bold ${balanceColor(hasPeriodFilter ? advanceLedger.periodClosingBalance : advanceLedger.calculatedCurrentBalance)}`}>
                              {balanceLabel(hasPeriodFilter ? advanceLedger.periodClosingBalance : advanceLedger.calculatedCurrentBalance)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                      </div>
                    </div>
                </div>

                {/* Bonuses */}
                <div>
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Bonuses
                  </h2>
                  {filteredBonuses.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                      <p className="text-slate-400 text-sm">
                        No bonuses recorded{fromDate || toDate ? ' in this date range' : ''}
                      </p>
                    </div>
                  ) : (
                    <div className="print-statement bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Date</th>
                            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Reason / Notes</th>
                            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Via</th>
                            <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {filteredBonuses.map((b) => (
                            <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{formatDate(b.bonus_date)}</td>
                              <td className="px-4 py-3.5 text-slate-800">{b.notes ?? '—'}</td>
                              <td className="px-4 py-3.5">
                                <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                                  {displayPaymentMethod(b.payment_mode) ?? '—'}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-right font-semibold text-red-600">{formatCurrency(b.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-200 bg-slate-50">
                            <td colSpan={3} className="px-5 py-3.5 text-sm font-bold text-slate-700">Total</td>
                            <td className="px-5 py-3.5 text-right text-sm font-bold text-red-600">{formatCurrency(totalBonus)}</td>
                          </tr>
                        </tfoot>
                      </table>
                      </div>
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
                    <div className="print-statement bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px]">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Period</th>
                              <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Gross</th>
                              <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Absent Deduction</th>
                              <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Advance Recovery</th>
                              <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Net Salary</th>
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
                                      href={withReturnTo(`/payroll/slips/${sl.salary_run_id}/${staffId}`, ledgerPath)}
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
      </div>
    </div>
  )
}
