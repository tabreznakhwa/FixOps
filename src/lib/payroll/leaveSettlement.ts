/**
 * Pro-rata salary settlement up to a chosen date.
 *
 * Use case: an employee leaves on the 20th and wants their money before they
 * travel. On the 9th you settle them to the 20th — the system works out what
 * that period is worth instead of anyone marking eleven days of attendance by
 * hand.
 *
 * This is paid as an ADVANCE, deliberately:
 *   - Days between today and the settlement date have not been worked yet, so
 *     the money is not earned salary. An advance is the correct treatment.
 *   - It leaves the one-run-per-month payroll model untouched (salary_runs is
 *     UNIQUE on organization_id + month + year), so month-end payroll for
 *     everyone else is unaffected.
 *   - staff.advance_balance already flows into the monthly run's advance
 *     deduction, so the month-end salary reconciles itself with no extra step.
 *
 * The formula mirrors `/api/payroll/process` so a settlement and the monthly
 * run agree. In particular the month is treated as 30 days and the absence
 * deduction base excludes the food allowance — both match the monthly run.
 */

/** The business treats every month as 30 days, matching the monthly payroll run. */
export const PAYROLL_DAYS_IN_MONTH = 30

export interface SettlementStaff {
  basic_salary: number
  housing_allowance: number
  transport_allowance: number
  other_allowance: number
  food_allowance: number | null
  fixed_overtime_monthly: number | null
  overtime_eligible: boolean
  advance_balance: number | null
}

export interface SettlementAttendance {
  date: string
  status: string
  overtime_hours: number | null
  friday_ot_amount: number | null
  is_public_holiday?: boolean | null
}

export interface SettlementResult {
  daysCovered: number
  proRataFactor: number
  basicEarned: number
  allowanceEarned: number
  foodEarned: number
  fixedOtEarned: number
  normalOvertime: number
  fridayOvertime: number
  absentDays: number
  absentDeduction: number
  grossEarned: number
  outstandingAdvance: number
  netPayable: number
  /** Days in the window with no attendance record yet — i.e. not worked at the time of settlement. */
  unworkedDays: number
  warnings: string[]
}

function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10))
}

/**
 * @param monthStart  first day of the salary month, YYYY-MM-01
 * @param settlementDate  last day being paid for, inclusive
 * @param today  used only to report how much of the window is not yet worked
 */
export function calcLeaveSettlement(
  staff: SettlementStaff,
  attendance: SettlementAttendance[],
  monthStart: string,
  settlementDate: string,
  today: string
): SettlementResult {
  const warnings: string[] = []

  const daysCovered = Math.max(0, Math.min(dayOfMonth(settlementDate), PAYROLL_DAYS_IN_MONTH))
  const proRataFactor = daysCovered / PAYROLL_DAYS_IN_MONTH

  const basic = Number(staff.basic_salary) || 0
  // Matches the monthly run: "allowance" excludes food, which is tracked apart.
  const allowance =
    (Number(staff.housing_allowance) || 0) +
    (Number(staff.transport_allowance) || 0) +
    (Number(staff.other_allowance) || 0)
  const food = Number(staff.food_allowance) || 0

  // Only records inside the settlement window count.
  const inWindow = attendance.filter(r => r.date >= monthStart && r.date <= settlementDate)

  const fridayOvertime = inWindow.reduce((s, r) => s + (Number(r.friday_ot_amount) || 0), 0)

  // Fixed OT is gated exactly as the monthly run gates it — eligible staff who
  // actually worked a Friday or public holiday — then pro-rated for the window.
  const fixedOtMonthly =
    staff.overtime_eligible && fridayOvertime > 0 ? Number(staff.fixed_overtime_monthly) || 0 : 0
  const fixedOtEarned = fixedOtMonthly * proRataFactor

  // Overtime is actual, never pro-rated: hours already recorded are already earned.
  const otHours = inWindow.reduce((s, r) => s + (Number(r.overtime_hours) || 0), 0)
  const hourlyRate = basic / PAYROLL_DAYS_IN_MONTH / 8
  const normalOvertime = hourlyRate * otHours

  const absentDays = inWindow.reduce((s, r) => {
    if (r.status === 'absent') return s + 1
    if (r.status === 'half_day') return s + 0.5
    return s
  }, 0)
  // Same base as the monthly run: basic + allowance + fixed OT, food excluded.
  const absentDeduction =
    absentDays > 0 ? ((basic + allowance + fixedOtMonthly) / PAYROLL_DAYS_IN_MONTH) * absentDays : 0

  const basicEarned = basic * proRataFactor
  const allowanceEarned = allowance * proRataFactor
  const foodEarned = food * proRataFactor

  const grossEarned =
    basicEarned + allowanceEarned + foodEarned + fixedOtEarned + normalOvertime + fridayOvertime

  const outstandingAdvance = Number(staff.advance_balance) || 0

  const netPayable = Math.max(0, grossEarned - absentDeduction - outstandingAdvance)

  // How much of the window is still in the future — the part being paid on trust.
  const covered = new Set(inWindow.map(r => r.date))
  let unworkedDays = 0
  const startDay = dayOfMonth(monthStart)
  for (let d = startDay; d <= daysCovered; d++) {
    const iso = `${monthStart.slice(0, 8)}${String(d).padStart(2, '0')}`
    if (iso > today && !covered.has(iso)) unworkedDays++
  }

  if (unworkedDays > 0) {
    warnings.push(
      `${unworkedDays} of the ${daysCovered} days being paid are still in the future and have not been worked yet.`
    )
  }
  if (outstandingAdvance > 0) {
    warnings.push(
      `An existing advance balance of KWD ${outstandingAdvance.toFixed(3)} has been netted off this payment.`
    )
  }
  if (grossEarned - absentDeduction - outstandingAdvance < 0) {
    warnings.push(
      'The existing advance balance exceeds what is earned to this date, so nothing is payable now.'
    )
  }

  return {
    daysCovered,
    proRataFactor,
    basicEarned,
    allowanceEarned,
    foodEarned,
    fixedOtEarned,
    normalOvertime,
    fridayOvertime,
    absentDays,
    absentDeduction,
    grossEarned,
    outstandingAdvance,
    netPayable,
    unworkedDays,
    warnings,
  }
}
