/**
 * Deterministic navigation origins for dashboard pages.
 *
 * Back goes where the user came from, never to whatever the record happens to
 * be related to. Browser history is not a reliable origin in this app for two
 * independent reasons: formal documents open in their own popup window (see
 * DocumentLink), and main-module navigation opens in-app tabs rendered as
 * always-mounted iframes (see TabShell) whose outer page never navigates —
 * neither leaves a shared history to go back through. Callers carry the
 * immediate source URL in a `return_to` query parameter and resolve it here.
 */

export type ReturnToValue = string | string[] | null | undefined
export type SearchParamValue = string | string[] | undefined
export type SearchParamsInput =
  | URLSearchParams
  | { entries(): IterableIterator<[string, string]> }
  | Record<string, SearchParamValue>

/** Longest prefix wins, so `/finance/invoices` beats `/finance`. */
export const NAVIGATION_LABELS = [
  ['/finance/opening-receivables', 'Opening Receivables'],
  ['/finance/owner-withdrawals', 'Owner Withdrawals'],
  ['/finance/receivables', 'Receivables'],
  ['/finance/outstanding', 'Outstanding'],
  ['/finance/quotations', 'Quotations'],
  ['/finance/invoices', 'Invoices'],
  ['/finance/payments', 'Payments'],
  ['/finance/expenses', 'Expenses'],
  ['/finance/cash-book', 'Cash Book'],
  ['/finance/bank-book', 'Bank Book'],
  ['/finance/transfers', 'Fund Transfers'],
  ['/finance/ledger', 'Customer Ledger'],
  ['/inventory/purchase-invoices', 'Purchase Invoices'],
  ['/inventory/opening-stock', 'Opening Stock'],
  ['/inventory/stock-trial', 'Stock Trial'],
  ['/inventory/parts-used', 'Parts Used'],
  ['/inventory/assets', 'Company Assets'],
  ['/suppliers/vendor-outstanding', 'Vendor Outstanding'],
  ['/suppliers/purchase-register', 'Purchase Register'],
  ['/suppliers/vendor-payments', 'Vendor Payments'],
  ['/suppliers/vendor-ledger', 'Vendor Ledger'],
  ['/suppliers/opening-payables', 'Opening Payables'],
  ['/suppliers/advances', 'Supplier Advances'],
  ['/payroll/my-payslips', 'My Payslips'],
  ['/payroll/leave-settlement', 'Leave Settlement'],
  ['/leave-applications', 'Leave Approvals'],
  ['/my-attendance', 'My Attendance'],
  ['/my-leave', 'My Leave'],
  ['/payroll/process', 'Payslips'],
  ['/staff/locations', 'Tech Locations'],
  ['/staff/ledger', 'Staff Ledger'],
  ['/settings/audit-trail', 'Audit Trail'],
  ['/settings/company', 'Company'],
  ['/work-orders', 'Work Orders'],
  ['/complaints', 'Complaints'],
  ['/customers', 'Customers'],
  ['/inventory', 'Inventory'],
  ['/suppliers', 'Suppliers'],
  ['/attendance', 'Attendance'],
  ['/payroll', 'Payroll'],
  ['/staff', 'Staff'],
  ['/settings', 'Settings'],
  ['/user-guide', 'User Guide'],
  ['/insights', 'Business Insights'],
  ['/amc', 'AMC Contracts'],
  ['/reports', 'Reports'],
  ['/dashboard', 'Dashboard'],
] as const

const INTERNAL_ORIGIN = 'https://fixops.internal'
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/
const MAX_RETURN_TO_LENGTH = 8192

function normalizedInternalPath(value: string): string | null {
  if (!value || value !== value.trim()) return null
  if (value.length > MAX_RETURN_TO_LENGTH) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (value.includes('\\') || CONTROL_CHARACTERS.test(value)) return null

  try {
    const url = new URL(value, INTERNAL_ORIGIN)
    if (url.origin !== INTERNAL_ORIGIN) return null

    // `__popup` and `__tab` are rendering state, not navigation origin.
    // DocumentLink sets `__popup` when opening the destination in a new
    // window; TabShell's tabSrc sets `__tab` when loading a module page
    // inside an in-app tab's iframe.
    url.searchParams.delete('__popup')
    url.searchParams.delete('__tab')
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

/** A normalized same-site origin, or null. Repeated values are rejected. */
export function safeReturnTo(value: ReturnToValue): string | null {
  return typeof value === 'string' ? normalizedInternalPath(value) : null
}

/** Remove popup-only state from a known internal path. */
export function stripTabParam(path: string): string | null {
  return normalizedInternalPath(path)
}

export function labelForPath(path: string, fallback = 'Back'): string {
  const safe = safeReturnTo(path)
  if (!safe) return fallback

  const pathname = new URL(safe, INTERNAL_ORIGIN).pathname
  const match = NAVIGATION_LABELS
    .filter(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    .sort((a, b) => b[0].length - a[0].length)[0]

  return match?.[1] ?? fallback
}

/** Build the exact current dashboard URL while excluding popup-only state. */
export function currentPath(
  pathname: string,
  searchParams?: SearchParamsInput | null,
): string {
  const base = safeReturnTo(pathname) ?? '/dashboard'
  const url = new URL(base, INTERNAL_ORIGIN)

  if (searchParams && typeof (searchParams as { entries?: unknown }).entries === 'function') {
    for (const [key, value] of (searchParams as { entries(): IterableIterator<[string, string]> }).entries()) {
      if (key !== '__popup') url.searchParams.append(key, value)
    }
  } else if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === '__popup' || value === undefined) continue
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, item))
      } else {
        url.searchParams.append(key, value)
      }
    }
  }

  return `${url.pathname}${url.search}${url.hash}`
}

/** Add or replace a validated immediate origin on an internal destination. */
export function withReturnTo(destination: string, origin: ReturnToValue): string {
  const safeDestination = safeReturnTo(destination)
  if (!safeDestination) throw new Error(`Invalid internal destination: ${destination}`)

  const safeOrigin = safeReturnTo(origin)
  if (!safeOrigin) return safeDestination

  const url = new URL(safeDestination, INTERNAL_ORIGIN)
  url.searchParams.set('return_to', safeOrigin)
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * Resolve one validated origin. The href and label always describe the same
 * destination so they cannot drift independently.
 */
export function resolveBack(
  returnTo: ReturnToValue,
  fallbackHref: string,
  fallbackLabel = 'Back',
): { href: string; label: string } {
  const safe = safeReturnTo(returnTo)
  if (!safe) return { href: fallbackHref, label: fallbackLabel }
  return { href: safe, label: labelForPath(safe) }
}

export function detailPath(
  pathname: string,
  returnTo: ReturnToValue,
): string {
  return withReturnTo(pathname, returnTo)
}

export type LegacyBackCandidate = {
  when: string | string[] | null | undefined
  href: string
  label: string
}

/** Explicit origin wins; ordered legacy relationship params remain fallbacks. */
export function resolveBackWithLegacy({
  returnTo,
  legacy,
  fallbackHref,
  fallbackLabel = 'Back',
}: {
  returnTo: ReturnToValue
  legacy: LegacyBackCandidate[]
  fallbackHref: string
  fallbackLabel?: string
}): { href: string; label: string } {
  const explicit = safeReturnTo(returnTo)
  if (explicit) return { href: explicit, label: labelForPath(explicit) }

  for (const candidate of legacy) {
    if (typeof candidate.when !== 'string' || !candidate.when) continue
    const href = safeReturnTo(candidate.href)
    if (href) return { href, label: candidate.label }
  }

  return { href: fallbackHref, label: fallbackLabel }
}

export function returnToFromFormData(formData: FormData): string | null {
  const values = formData.getAll('return_to')
  return values.length === 1 && typeof values[0] === 'string'
    ? safeReturnTo(values[0])
    : null
}
