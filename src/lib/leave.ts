export const LEAVE_TYPES = ['annual_leave', 'sick_leave', 'compensation_leave'] as const
export type LeaveType = typeof LEAVE_TYPES[number]

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual_leave: 'Annual Leave (Unpaid)',
  sick_leave: 'Sick Leave',
  compensation_leave: 'Compensation Leave',
}

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const
export type LeaveStatus = typeof LEAVE_STATUSES[number]

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

export const ADMIN_LEAVE_ROLES = ['owner', 'admin'] as const

function parseISODate(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10) === date ? parsed : null
}

/** Friday is FixOps' weekly off and never consumes an employee's leave days. */
export function countLeaveDays(startDate: string, endDate: string): number {
  const start = parseISODate(startDate)
  const end = parseISODate(endDate)
  if (!start || !end || end < start) return 0

  const totalDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
  const wholeWeeks = Math.floor(totalDays / 7)
  let days = totalDays - wholeWeeks

  const remainder = totalDays % 7
  for (let offset = 0; offset < remainder; offset++) {
    if ((start.getUTCDay() + offset) % 7 === 5) days--
  }
  return days
}

export function datesOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
): boolean {
  return firstStart <= secondEnd && secondStart <= firstEnd
}
