export const RECEIVABLE_SORTS = ['date', 'amount', 'invoice'] as const
export const RECEIVABLE_DIRECTIONS = ['asc', 'desc'] as const

export type ReceivableSort = (typeof RECEIVABLE_SORTS)[number]
export type ReceivableDirection = (typeof RECEIVABLE_DIRECTIONS)[number]
export type ReceivableSource = 'invoice' | 'opening'

export type ReceivableRow = {
  rowKey: string
  invoiceId: string | null
  source: ReceivableSource
  invoice_number: string
  balance_due: number
  due_date: string | null
  status: string
  invoice_date: string
}

export const DEFAULT_RECEIVABLE_SORT: ReceivableSort = 'amount'
export const DEFAULT_RECEIVABLE_DIRECTION: ReceivableDirection = 'desc'

const invoiceReferenceCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
})

function isReceivableSort(value: unknown): value is ReceivableSort {
  return typeof value === 'string'
    && RECEIVABLE_SORTS.includes(value as ReceivableSort)
}

function isReceivableDirection(value: unknown): value is ReceivableDirection {
  return typeof value === 'string'
    && RECEIVABLE_DIRECTIONS.includes(value as ReceivableDirection)
}

export function resolveReceivableSort(
  sort: string | string[] | undefined,
  direction: string | string[] | undefined,
): { sort: ReceivableSort; direction: ReceivableDirection } {
  return {
    sort: isReceivableSort(sort) ? sort : DEFAULT_RECEIVABLE_SORT,
    direction: isReceivableDirection(direction)
      ? direction
      : DEFAULT_RECEIVABLE_DIRECTION,
  }
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function compareTieBreakers(a: ReceivableRow, b: ReceivableRow): number {
  const sourceComparison = compareText(a.source, b.source)
  return sourceComparison || compareText(a.rowKey, b.rowKey)
}

export function sortReceivableRows(
  rows: ReceivableRow[],
  sort: ReceivableSort,
  direction: ReceivableDirection,
): ReceivableRow[] {
  const directionMultiplier = direction === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    let comparison = 0

    if (sort === 'date') {
      comparison = compareText(a.invoice_date, b.invoice_date)
    } else if (sort === 'amount') {
      comparison = Number(a.balance_due) - Number(b.balance_due)
    } else {
      comparison = invoiceReferenceCollator.compare(
        a.invoice_number,
        b.invoice_number,
      )
    }

    const stableComparison = comparison || compareTieBreakers(a, b)
    return stableComparison * directionMultiplier
  })
}
