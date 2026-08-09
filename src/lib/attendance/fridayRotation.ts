import { isFriday } from '@/lib/attendance'

/**
 * Ranks staff by who is most due for the next Friday / public-holiday shift.
 *
 * Friday work is paid at a flat premium, so over a year it is real money and
 * whoever gets picked repeatedly earns noticeably more. This turns "who did it
 * last month?" — which nobody can hold in their head across 14 people — into an
 * ordered list.
 *
 * It ranks, it does not assign. The supervisor still chooses, because the data
 * cannot know who is on leave, who is trained for the callout, or who asked for
 * the work.
 */

export interface RotationStaff {
  id: string
  full_name: string
  designation: string | null
  /** Their flat Friday rate, for showing what a shift is worth to them. */
  friday_ot_amount: number | null
}

export interface RotationAttendance {
  staff_id: string
  date: string
  status: string
  friday_ot_amount: number | null
  is_public_holiday?: boolean | null
}

export interface RotationRow {
  staffId: string
  name: string
  designation: string | null
  /** Friday/holiday shifts worked in the calendar month containing `today`. */
  thisMonthCount: number
  /** Friday/holiday shifts worked in the previous calendar month. */
  lastMonthCount: number
  /** Total across the whole window supplied. */
  totalCount: number
  /** Money earned from those shifts across the window. */
  totalEarned: number
  lastWorkedDate: string | null
  daysSinceLastWorked: number | null
  /** Flat rate a shift is worth to this person, from their staff profile. */
  shiftRate: number
}

/** A Friday, or any day flagged as a public holiday, that was actually worked. */
function isWorkedPremiumDay(r: RotationAttendance): boolean {
  if (r.status !== 'present' && r.status !== 'half_day') return false
  return isFriday(r.date) || Boolean(r.is_public_holiday)
}

function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime()
  const b = new Date(`${to}T00:00:00Z`).getTime()
  return Math.floor((b - a) / 86_400_000)
}

/**
 * Returned most-due first.
 *
 * Order of precedence:
 *  1. Fewest shifts this month — keeps rotation moving within the month.
 *  2. Fewest shifts last month — the explicit ask: someone who worked Fridays
 *     last month yields to someone who did not.
 *  3. Longest since they last worked one; never worked ranks ahead of everyone.
 *  4. Name, so the order is stable rather than arbitrary between equals.
 */
export function rankFridayRotation(
  staff: RotationStaff[],
  attendance: RotationAttendance[],
  today: string
): RotationRow[] {
  const thisMonth = today.slice(0, 7)
  const lastMonth = previousMonthKey(thisMonth)

  const worked = attendance.filter(isWorkedPremiumDay)

  const rows: RotationRow[] = staff.map(s => {
    const mine = worked.filter(r => r.staff_id === s.id)
    const dates = mine.map(r => r.date).sort()
    const lastWorkedDate = dates.length ? dates[dates.length - 1] : null

    return {
      staffId: s.id,
      name: s.full_name,
      designation: s.designation,
      thisMonthCount: mine.filter(r => r.date.slice(0, 7) === thisMonth).length,
      lastMonthCount: mine.filter(r => r.date.slice(0, 7) === lastMonth).length,
      totalCount: mine.length,
      totalEarned: mine.reduce((sum, r) => sum + (Number(r.friday_ot_amount) || 0), 0),
      lastWorkedDate,
      daysSinceLastWorked: lastWorkedDate ? daysBetween(lastWorkedDate, today) : null,
      shiftRate: Number(s.friday_ot_amount) || 0,
    }
  })

  return rows.sort((a, b) => {
    if (a.thisMonthCount !== b.thisMonthCount) return a.thisMonthCount - b.thisMonthCount
    if (a.lastMonthCount !== b.lastMonthCount) return a.lastMonthCount - b.lastMonthCount
    // Never worked one sorts ahead of anyone who has.
    const aDays = a.daysSinceLastWorked ?? Number.POSITIVE_INFINITY
    const bDays = b.daysSinceLastWorked ?? Number.POSITIVE_INFINITY
    if (aDays !== bDays) return bDays - aDays
    return a.name.localeCompare(b.name)
  })
}
