import { isFriday } from '@/lib/attendance'

/**
 * Decides who should be marked absent for a day nobody recorded them on.
 *
 * Not clocking in creates no attendance row at all, so payroll — which only
 * deducts for rows explicitly marked 'absent' — pays the day in full. This
 * closes that gap by writing the missing rows.
 *
 * Deliberately conservative: a wrongly-created absence takes money off someone,
 * so every rule here errs towards NOT marking.
 */

export interface AbsentCandidate {
  id: string
  full_name: string
  joining_date: string | null
}

export interface AutoAbsentInput {
  /** Day being closed, YYYY-MM-DD. */
  date: string
  /** Today in Kuwait — the day being closed must already be over. */
  today: string
  activeStaff: AbsentCandidate[]
  /** staff_id of everyone who already has a record for `date`. */
  alreadyRecorded: string[]
  /** True when any record for `date` is flagged as a public holiday. */
  isPublicHoliday: boolean
}

export interface AutoAbsentDecision {
  /** Staff to write 'absent' rows for. */
  toMark: AbsentCandidate[]
  /** Set when the whole day is skipped, for logging and the UI. */
  skippedReason: string | null
}

export function decideAutoAbsent(input: AutoAbsentInput): AutoAbsentDecision {
  const { date, today, activeStaff, alreadyRecorded, isPublicHoliday } = input
  const none = (reason: string): AutoAbsentDecision => ({ toMark: [], skippedReason: reason })

  // Never close a day that has not finished. Staff here clock out as late as
  // 23:30, so marking during the day would flag people who are still working.
  if (date >= today) return none('Day is not over yet')

  // Friday is the weekly off — nobody clocking in is the normal case, not absence.
  if (isFriday(date)) return none('Friday — weekly off')

  if (isPublicHoliday) return none('Public holiday')

  const recorded = new Set(alreadyRecorded)

  const toMark = activeStaff.filter((s) => {
    if (recorded.has(s.id)) return false
    // Someone cannot be absent before they joined.
    if (s.joining_date && s.joining_date > date) return false
    return true
  })

  return { toMark, skippedReason: null }
}
