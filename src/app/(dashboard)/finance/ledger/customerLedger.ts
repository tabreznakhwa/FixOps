export type CustomerLedgerEventType = 'opening_balance' | 'invoice' | 'credit_note' | 'payment' | 'advance'

export type CustomerLedgerEvent = {
  sourceId: string
  date: string
  description: string
  type: CustomerLedgerEventType
  reference: string | null
  debit: number
  credit: number
  /** Debits must precede settlements recorded on the same business date. */
  sequence: number
}

export type CustomerLedgerRow = CustomerLedgerEvent & {
  id: string
  runningBalance: number
}

export type CustomerLedger = {
  rows: CustomerLedgerRow[]
  periodOpeningBalance: number
  periodOpeningDate: string | null
  periodDebit: number
  periodCredit: number
  periodClosingBalance: number
  currentBalance: number
  totalDebit: number
  totalCredit: number
}

function amount(value: number): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
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

export function compareCustomerLedgerEvents(a: CustomerLedgerEvent, b: CustomerLedgerEvent): number {
  return a.date.localeCompare(b.date)
    || a.sequence - b.sequence
    || a.type.localeCompare(b.type)
    || a.sourceId.localeCompare(b.sourceId)
}

export function buildCustomerLedger(
  events: CustomerLedgerEvent[],
  filters: { from?: string | null; to?: string | null } = {},
): CustomerLedger {
  const from = filters.from || null
  const to = filters.to || null
  const all = [...events]
    .map((event) => ({
      ...event,
      debit: amount(event.debit),
      credit: amount(event.credit),
    }))
    .sort(compareCustomerLedgerEvents)

  const totalDebit = roundCurrency(all.reduce((sum, event) => sum + event.debit, 0))
  const totalCredit = roundCurrency(all.reduce((sum, event) => sum + event.credit, 0))
  const currentBalance = roundCurrency(totalDebit - totalCredit)

  const periodOpeningBalance = from
    ? roundCurrency(all
        .filter((event) => event.date < from)
        .reduce((sum, event) => sum + event.debit - event.credit, 0))
    : 0

  const visible = all.filter((event) => (
    (!from || event.date >= from) && (!to || event.date <= to)
  ))

  let runningBalance = periodOpeningBalance
  const rows = visible.map((event) => {
    runningBalance = roundCurrency(runningBalance + event.debit - event.credit)
    return {
      ...event,
      id: `${event.type}:${event.sourceId}`,
      runningBalance,
    }
  })

  const periodDebit = roundCurrency(visible.reduce((sum, event) => sum + event.debit, 0))
  const periodCredit = roundCurrency(visible.reduce((sum, event) => sum + event.credit, 0))

  return {
    rows,
    periodOpeningBalance,
    periodOpeningDate: from ? dayBefore(from) : null,
    periodDebit,
    periodCredit,
    periodClosingBalance: roundCurrency(periodOpeningBalance + periodDebit - periodCredit),
    currentBalance,
    totalDebit,
    totalCredit,
  }
}
