const DAY_MS = 86_400_000

export type ReceivableAging = {
  current: number
  '30': number
  '60': number
  '90+': number
}

function isoDateValue(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function daysPastDue(today: string, dueDate: string): number {
  return Math.floor((isoDateValue(today) - isoDateValue(dueDate)) / DAY_MS)
}

export function buildReceivableAging(
  rows: Array<{ balance_due: number; due_date: string | null }>,
  today: string,
): ReceivableAging {
  const aging: ReceivableAging = { current: 0, '30': 0, '60': 0, '90+': 0 }

  for (const row of rows) {
    const balance = Number(row.balance_due ?? 0)
    if (!row.due_date) {
      aging.current += balance
      continue
    }

    const daysPast = daysPastDue(today, row.due_date)
    if (daysPast <= 0) aging.current += balance
    else if (daysPast <= 30) aging['30'] += balance
    else if (daysPast <= 60) aging['60'] += balance
    else aging['90+'] += balance
  }

  return aging
}
