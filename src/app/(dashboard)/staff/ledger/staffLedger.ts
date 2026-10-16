export type StaffAdvanceEventSource = 'advance_issue' | 'salary_recovery' | 'repayment'
export type StaffAdvanceEventType = 'advance' | 'loan' | 'recovery' | 'repayment'

export type StaffAdvanceEvent = {
  source: StaffAdvanceEventSource
  sourceId: string
  date: string
  description: string
  type: StaffAdvanceEventType
  debit: number
  credit: number
}

export type StaffAdvanceLedgerRow = StaffAdvanceEvent & {
  id: string
  balance: number
}

export type StaffAdvanceLedger = {
  rows: StaffAdvanceLedgerRow[]
  openingBase: number
  periodOpeningBalance: number
  periodOpeningDate: string | null
  periodDebit: number
  periodCredit: number
  periodClosingBalance: number
  calculatedCurrentBalance: number
  allTimeDebit: number
  allTimeCredit: number
}

const SOURCE_ORDER: Record<StaffAdvanceEventSource, number> = {
  advance_issue: 0,
  salary_recovery: 1,
  repayment: 2,
}

function amount(value: number): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function dayBefore(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const previous = new Date(Date.UTC(year, month - 1, day - 1))
  return [
    previous.getUTCFullYear(),
    String(previous.getUTCMonth() + 1).padStart(2, '0'),
    String(previous.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

export function compareStaffAdvanceEvents(a: StaffAdvanceEvent, b: StaffAdvanceEvent): number {
  return a.date.localeCompare(b.date)
    || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source]
    || a.sourceId.localeCompare(b.sourceId)
}

export function buildStaffAdvanceLedger(
  events: StaffAdvanceEvent[],
  options: {
    openingAdvance?: number | null
    openingLoan?: number | null
    from?: string | null
    to?: string | null
  } = {},
): StaffAdvanceLedger {
  const from = options.from || null
  const to = options.to || null
  const openingBase = amount(options.openingAdvance ?? 0) + amount(options.openingLoan ?? 0)
  const all = [...events]
    .map((event) => ({
      ...event,
      debit: amount(event.debit),
      credit: amount(event.credit),
    }))
    .sort(compareStaffAdvanceEvents)

  const eventDebit = all.reduce((sum, event) => sum + event.debit, 0)
  const allTimeCredit = all.reduce((sum, event) => sum + event.credit, 0)
  const allTimeDebit = openingBase + eventDebit
  const calculatedCurrentBalance = allTimeDebit - allTimeCredit

  const periodOpeningBalance = from
    ? openingBase + all
        .filter((event) => event.date < from)
        .reduce((sum, event) => sum + event.debit - event.credit, 0)
    : openingBase

  const visible = all.filter((event) => (
    (!from || event.date >= from) && (!to || event.date <= to)
  ))

  let runningBalance = periodOpeningBalance
  const rows = visible.map((event) => {
    runningBalance += event.debit - event.credit
    return {
      ...event,
      id: `${event.source}:${event.sourceId}`,
      balance: runningBalance,
    }
  })

  const periodDebit = visible.reduce((sum, event) => sum + event.debit, 0)
  const periodCredit = visible.reduce((sum, event) => sum + event.credit, 0)

  return {
    rows,
    openingBase,
    periodOpeningBalance,
    periodOpeningDate: from ? dayBefore(from) : null,
    periodDebit,
    periodCredit,
    periodClosingBalance: periodOpeningBalance + periodDebit - periodCredit,
    calculatedCurrentBalance,
    allTimeDebit,
    allTimeCredit,
  }
}

export function advanceBalancesReconcile(
  calculated: number,
  canonical: number,
  tolerance = 0.001,
): boolean {
  const difference = Math.abs(amount(calculated) - amount(canonical))
  return difference <= tolerance + Number.EPSILON * Math.max(1, Math.abs(calculated), Math.abs(canonical))
}
