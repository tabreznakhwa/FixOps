// Kuwait company duty rules — shared by the HR attendance form and technician self clock-in
export const DUTY_START = '08:30'    // 8:30 AM
export const DUTY_END = '17:30'      // 5:30 PM
const LUNCH_START_M = 13 * 60        // 1:00 PM in minutes
const LUNCH_END_M = 14 * 60          // 2:00 PM in minutes
const FIXED_OT_END_M = 20 * 60       // 8:00 PM in minutes
const STANDARD_HOURS = 8
const OT_MULTIPLIER = 1.25           // Normal OT: 1 hr = 1.25 paid hrs

function toMins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export interface AttendanceBreakdown {
  hoursWorked: number
  lunchDeducted: boolean
  fixedOtHrs: number
  normalOtActualHrs: number
  normalOtPaidHrs: number
}

export function calcAttendanceBreakdown(checkIn: string, checkOut: string): AttendanceBreakdown | null {
  if (!checkIn || !checkOut) return null

  const inM = toMins(checkIn)
  let outM = toMins(checkOut)
  if (outM <= inM) outM += 24 * 60 // overnight

  // Lunch deduction: 1 hour if shift spans 1-2 PM
  let lunchDeduct = 0
  if (inM < LUNCH_END_M && outM > LUNCH_START_M) {
    const overlapStart = Math.max(inM, LUNCH_START_M)
    const overlapEnd = Math.min(outM, LUNCH_END_M)
    lunchDeduct = Math.max(0, overlapEnd - overlapStart)
  }

  const netMins = outM - inM - lunchDeduct
  const hoursWorked = Math.round((netMins / 60) * 4) / 4 // round to 0.25h

  // Fixed OT: time between DUTY_END (17:30) and FIXED_OT_END (20:00)
  const dutyEndM = toMins(DUTY_END)
  const fixedOtStart = Math.max(outM > dutyEndM ? dutyEndM : outM, dutyEndM)
  const fixedOtEnd = Math.min(outM, FIXED_OT_END_M)
  const fixedOtActualHrs = Math.round((Math.max(0, fixedOtEnd - fixedOtStart) / 60) * 4) / 4

  // Normal OT: time after 8 PM (20:00), multiplied by 1.25
  const normalOtStart = Math.max(outM, FIXED_OT_END_M)
  const normalOtActualHrs = Math.max(0, (normalOtStart > FIXED_OT_END_M ? outM - FIXED_OT_END_M : 0)) / 60
  const normalOtPaidHrs = Math.round(normalOtActualHrs * OT_MULTIPLIER * 4) / 4

  return {
    hoursWorked: Math.max(0, Math.min(hoursWorked, STANDARD_HOURS)),
    lunchDeducted: lunchDeduct > 0,
    fixedOtHrs: fixedOtActualHrs,
    normalOtActualHrs: Math.round(normalOtActualHrs * 4) / 4,
    normalOtPaidHrs,
  }
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
