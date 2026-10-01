// Kuwait company duty rules — shared by the HR attendance form and technician self clock-in
export const DUTY_START = '08:30'    // 8:30 AM — default check-in pre-fill only
export const DUTY_END = '17:30'      // 5:30 PM — default check-out pre-fill only
const LUNCH_START_M = 13 * 60        // 1:00 PM in minutes
const LUNCH_END_M = 14 * 60          // 2:00 PM in minutes
const FIXED_OT_END_M = 20 * 60       // 8:00 PM in minutes
const STANDARD_HOURS = 8
const FRIDAY_FIXED_OT_HOURS = 8     // Friday/holiday: first 8 worked hours = fixed OT
const OT_MULTIPLIER = 1.25           // Normal OT: 1 hr = 1.25 paid hrs

// From this date the 8-hour duty is anchored to the employee's clock-in time —
// no fixed 8:30–5:30 schedule and no daily fixed-OT window. Overtime begins once
// 8 hours have actually been WORKED, lunch excluded.
// Before it, the old seasonal rules apply unchanged.
const CLOCK_IN_ANCHOR_START = '2026-10-01'

// ── Shifts and the lunch hour ──────────────────────────────────────────────
// Morning staff take an hour for lunch; evening staff work straight through.
// There is deliberately no shift field: people move between shifts constantly,
// so anything stored per employee would be wrong most of the time, and guessing
// the shift from the clock-in time misreads a late arrival as an evening start.
//
// Instead the lunch hour detects itself. It is deducted only when the working
// window actually covers 1–2 PM, so a morning shift (08:30–17:30) always loses
// the hour and an evening shift (from 2 PM) never does — without the system
// needing to know, or be told, which shift anyone is on.
//
// For anyone working their normal shift this matches fixed 5:30 PM / 10 PM
// overtime boundaries exactly:
//   Morning 08:30–17:30 → 9 clock − 1 lunch = 8 worked → no overtime
//   Evening 14:00–22:00 → 8 clock − 0 lunch = 8 worked → no overtime
// and a late arrival simply has to work the full 8 hours before overtime starts.

/**
 * Plain-language description of the duty rule in force on a date, so the HR
 * attendance forms can never describe a rule other than the one being applied.
 */
export function dutyHints(date: string): { dutyStart: string; overtime: string } {
  if (usesClockInAnchor(date)) {
    return {
      dutyStart: '8-hour duty starts at clock-in',
      overtime: 'Overtime after 8 worked hours (1 hr lunch if working 1–2 PM)',
    }
  }
  return { dutyStart: 'Standard duty starts 8:30 AM', overtime: 'Overtime after 8 PM' }
}

function toMins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Returns true if the ISO date string (YYYY-MM-DD) falls on a Friday
export function isFriday(dateStr: string): boolean {
  if (!dateStr) return false
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay() === 5
}

// Fixed overtime (the flat monthly amount on each payslip) is a summer-only
// benefit: on 1 March – 30 September, off 1 October – end of February. This
// gates payroll only — the daily attendance breakdown has no fixed-OT window
// once the clock-in-anchored rule applies.
export function isFixedOtMonth(month: number): boolean {
  return month >= 3 && month <= 9
}

// True once the clock-in-anchored duty rule is in effect (1 Oct 2026).
export function usesClockInAnchor(dateStr?: string): boolean {
  if (!dateStr) return false
  return dateStr >= CLOCK_IN_ANCHOR_START
}

export interface AttendanceBreakdown {
  hoursWorked: number
  lunchDeducted: boolean
  fixedOtHrs: number
  normalOtActualHrs: number
  normalOtPaidHrs: number
  isFridayOrHoliday: boolean
}

export function calcAttendanceBreakdown(
  checkIn: string,
  checkOut: string,
  isFridayOrHoliday = false,
  date?: string,
): AttendanceBreakdown | null {
  if (!checkIn || !checkOut) return null

  const inM = toMins(checkIn)
  let outM = toMins(checkOut)
  // Overnight shift. Strictly less-than: an identical clock-in and clock-out is a
  // zero-length shift (usually a mis-click), not a 24-hour one — treating it as
  // 24 hours paid a full day of overtime for no work.
  if (outM < inM) outM += 24 * 60

  const anchored = usesClockInAnchor(date)

  // Lunch (1–2 PM), deducted only when the working window actually covers it.
  // This is what separates the shifts without any shift field: a morning shift
  // spans 1–2 PM and loses the hour, an evening shift starting at 2 PM does not.
  // It applies on every day — summer, winter, Friday and public holiday alike.
  const lunchDeduct = inM >= LUNCH_END_M || outM <= LUNCH_START_M
    ? 0
    : Math.max(0, Math.min(outM, LUNCH_END_M) - Math.max(inM, LUNCH_START_M))

  const netMins = outM - inM - lunchDeduct
  const totalHours = Math.round((netMins / 60) * 4) / 4

  if (isFridayOrHoliday) {
    // Friday/public holiday: no regular hours — entire shift is overtime.
    // First FRIDAY_FIXED_OT_HOURS hours = fixed OT; beyond = normal OT ×1.25.
    const fixedOtHrs = Math.min(totalHours, FRIDAY_FIXED_OT_HOURS)
    const normalOtActualHrs = Math.round(Math.max(0, totalHours - FRIDAY_FIXED_OT_HOURS) * 4) / 4
    const normalOtPaidHrs = Math.round(normalOtActualHrs * OT_MULTIPLIER * 4) / 4
    return {
      hoursWorked: 0,
      lunchDeducted: lunchDeduct > 0,
      fixedOtHrs,
      normalOtActualHrs,
      normalOtPaidHrs,
      isFridayOrHoliday: true,
    }
  }

  // Regular day — from 1 Oct 2026 the 8-hour duty starts at clock-in and
  // overtime is everything beyond 8 WORKED hours (lunch already excluded above).
  if (anchored) {
    const hoursWorked = Math.max(0, Math.min(totalHours, STANDARD_HOURS))
    const normalOtActualHrs = Math.round(Math.max(0, totalHours - STANDARD_HOURS) * 4) / 4
    const normalOtPaidHrs = Math.round(normalOtActualHrs * OT_MULTIPLIER * 4) / 4
    return {
      hoursWorked,
      lunchDeducted: lunchDeduct > 0,
      fixedOtHrs: 0,
      normalOtActualHrs,
      normalOtPaidHrs,
      isFridayOrHoliday: false,
    }
  }

  // Regular day — pre-1-Oct-2026 seasonal rules (fixed 8:30–5:30 schedule).
  const hoursWorked = Math.max(0, Math.min(totalHours, STANDARD_HOURS))
  const month = date
    ? Number(date.slice(5, 7))
    : new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuwait' })).getMonth() + 1

  let fixedOtActualHrs: number
  let normalOtActualHrs: number
  if (isFixedOtMonth(month)) {
    // Summer (Mar–Sep): fixed OT covers DUTY_END (17:30) → FIXED_OT_END (20:00);
    // normal OT only starts after 20:00.
    const dutyEndM = toMins(DUTY_END)
    const fixedOtEnd = Math.min(outM, FIXED_OT_END_M)
    fixedOtActualHrs = Math.round((Math.max(0, fixedOtEnd - dutyEndM) / 60) * 4) / 4
    normalOtActualHrs = Math.max(0, outM > FIXED_OT_END_M ? (outM - FIXED_OT_END_M) / 60 : 0)
  } else {
    // Winter (Oct–Feb): no fixed overtime. Everything past the 8-hour duty is
    // normal overtime — the same "first 8h, rest ×1.25" shape as the Friday rule.
    fixedOtActualHrs = 0
    normalOtActualHrs = Math.max(0, totalHours - STANDARD_HOURS)
  }
  const normalOtPaidHrs = Math.round(normalOtActualHrs * OT_MULTIPLIER * 4) / 4

  return {
    hoursWorked,
    lunchDeducted: lunchDeduct > 0,
    fixedOtHrs: fixedOtActualHrs,
    normalOtActualHrs: Math.round(normalOtActualHrs * 4) / 4,
    normalOtPaidHrs,
    isFridayOrHoliday: false,
  }
}

/**
 * How many overtime hours an employee is actually paid for on a given day.
 *
 * Daily overtime on an ordinary working day is only for overtime-eligible staff.
 * Friday and public-holiday overtime is paid to EVERYONE — and that includes the
 * hours beyond the first 8 on such a day, which are overtime for the holiday, not
 * ordinary daily overtime. On a holiday the first 8 hours are covered separately
 * by the flat Friday OT amount; these are the additional hours on top.
 */
export function payableOvertimeHours(
  hours: number,
  opts: { overtimeEligible: boolean; isFridayOrHoliday: boolean }
): number {
  if (opts.isFridayOrHoliday) return Number(hours) || 0
  return opts.overtimeEligible ? Number(hours) || 0 : 0
}

export function nowInKuwait(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuwait' }))
}

export function kuwaitISODate(d: Date = nowInKuwait()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function kuwaitTimeHHMM(d: Date = nowInKuwait()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
