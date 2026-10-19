import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  calcAttendanceBreakdown,
  dutyHints,
  usesShiftClamp,
} from '../src/lib/attendance'

const correctedDate = '2026-10-19'

function breakdown(checkIn: string, checkOut: string, options?: {
  date?: string
  isFridayOrHoliday?: boolean
}) {
  const result = calcAttendanceBreakdown(
    checkIn,
    checkOut,
    options?.isFridayOrHoliday ?? false,
    options?.date ?? correctedDate,
  )
  assert.ok(result, `expected a breakdown for ${checkIn}–${checkOut}`)
  return result
}

function assertHours(
  checkIn: string,
  checkOut: string,
  expected: { worked: number; actualOt: number; paidOt: number },
  options?: { date?: string; isFridayOrHoliday?: boolean },
) {
  const result = breakdown(checkIn, checkOut, options)
  assert.equal(result.hoursWorked, expected.worked, `${checkIn}–${checkOut} worked hours`)
  assert.equal(result.normalOtActualHrs, expected.actualOt, `${checkIn}–${checkOut} actual OT`)
  assert.equal(result.normalOtPaidHrs, expected.paidOt, `${checkIn}–${checkOut} paid OT`)
}

assert.equal(usesShiftClamp('2026-10-18'), false)
assert.equal(usesShiftClamp(correctedDate), true)
assert.deepEqual(dutyHints(correctedDate), {
  dutyStart: 'Credit starts no earlier than 8:30 AM or 2:00 PM',
  overtime: 'Overtime after 8 credited hours',
})

// First shift: early arrivals do not receive credit before 08:30.
for (const checkIn of ['08:00', '08:15', '08:30']) {
  assertHours(checkIn, '17:30', { worked: 8, actualOt: 0, paidOt: 0 })
}
assertHours('09:00', '17:30', { worked: 7.5, actualOt: 0, paidOt: 0 })
assertHours('09:00', '18:00', { worked: 8, actualOt: 0, paidOt: 0 })
assertHours('08:30', '19:00', { worked: 8, actualOt: 1.5, paidOt: 2 })

// Second shift: 13:30 is the inference cutoff, and credit starts at 14:00.
for (const checkIn of ['13:30', '13:45', '14:00']) {
  assertHours(checkIn, '22:00', { worked: 8, actualOt: 0, paidOt: 0 })
}
assertHours('14:30', '22:00', { worked: 7.5, actualOt: 0, paidOt: 0 })
assertHours('14:30', '22:30', { worked: 8, actualOt: 0, paidOt: 0 })
assertHours('14:00', '23:00', { worked: 8, actualOt: 1, paidOt: 1.25 })

// The minute before the cutoff is treated as a late first-shift arrival.
assertHours('13:29', '22:00', { worked: 8, actualOt: 0, paidOt: 0 })
assertHours('13:29', '22:15', { worked: 8, actualOt: 0.25, paidOt: 0.25 })
assertHours('13:29', '22:30', { worked: 8, actualOt: 0.5, paidOt: 0.75 })

// Friday/holiday calculation stays on the raw interval and remains all overtime.
const holiday = breakdown('08:00', '17:30', { isFridayOrHoliday: true })
assert.equal(holiday.hoursWorked, 0)
assert.equal(holiday.fixedOtHrs, 8)
assert.equal(holiday.normalOtActualHrs, 0.5)
assert.equal(holiday.normalOtPaidHrs, 0.75)

// Existing October records and pre-anchor seasonal rules are not retroactively changed.
assertHours('08:00', '17:30', { worked: 8, actualOt: 0.5, paidOt: 0.75 }, { date: '2026-10-18' })
const historical = breakdown('08:30', '21:00', { date: '2026-09-30' })
assert.equal(historical.hoursWorked, 8)
assert.equal(historical.fixedOtHrs, 2.5)
assert.equal(historical.normalOtActualHrs, 1)
assert.equal(historical.normalOtPaidHrs, 1.25)

// Overnight rollover is preserved for second-shift attendance.
assertHours('14:00', '00:00', { worked: 8, actualOt: 2, paidOt: 2.5 })

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')
for (const path of [
  'src/app/api/attendance/route.ts',
  'src/app/api/attendance/[id]/route.ts',
]) {
  const source = read(path)
  assert.ok(
    source.includes('calcAttendanceBreakdown(check_in, check_out, isHoliday, date)'),
    `${path} must recalculate worked time through the shared helper`,
  )
  assert.ok(
    source.includes('breakdown?.hoursWorked ?? 0'),
    `${path} must persist server-calculated regular hours`,
  )
  assert.ok(
    source.includes('breakdown?.normalOtPaidHrs ?? 0'),
    `${path} must persist server-calculated overtime`,
  )
}

console.log('attendance shift timing assertions passed')
