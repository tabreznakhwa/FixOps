import type { SearchParamValue } from '@/lib/backNav'

type LedgerDateRange = {
  fromDate: string
  toDate: string
  error: string | null
}

function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function resolveLedgerDateRange(
  fromValue: SearchParamValue,
  toValue: SearchParamValue,
): LedgerDateRange {
  const hasDuplicateValue = Array.isArray(fromValue) || Array.isArray(toValue)
  const fromDate = typeof fromValue === 'string' ? fromValue : ''
  const toDate = typeof toValue === 'string' ? toValue : ''

  if (hasDuplicateValue || (fromDate && !isValidISODate(fromDate)) || (toDate && !isValidISODate(toDate))) {
    return {
      fromDate: '',
      toDate: '',
      error: 'The statement dates are invalid. Showing the all-time statement instead.',
    }
  }

  if (fromDate && toDate && fromDate > toDate) {
    return {
      fromDate: '',
      toDate: '',
      error: 'From Date must be on or before To Date. Showing the all-time statement instead.',
    }
  }

  return { fromDate, toDate, error: null }
}
