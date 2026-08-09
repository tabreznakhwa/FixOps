/**
 * Resolves a Back button's destination and label from one value.
 *
 * The rule this app follows: Back goes where the user came from, never to
 * whatever the record happens to be related to. Origin travels as a `return_to`
 * query param set by the page that linked here; without one, Back falls back to
 * the destination module's own list.
 *
 * Both href and label come out of a single call so a button can never name one
 * destination while navigating to another — a bug that shipped once already,
 * where an invoice reached from a payment read "Invoices" but went back to the
 * payment.
 *
 * `return_to` is only ever honoured as a same-site relative path. It reaches
 * server-side `redirect()` calls in places, and an unchecked value there is an
 * open redirect.
 */

/** Longest prefix wins, so `/finance/invoices` beats `/finance`. */
const LABELS: [string, string][] = [
  ['/finance/receivables', 'Receivables'],
  ['/finance/outstanding', 'Outstanding'],
  ['/finance/quotations', 'Quotations'],
  ['/finance/invoices', 'Invoices'],
  ['/finance/payments', 'Payments'],
  ['/finance/expenses', 'Expenses'],
  ['/finance/ledger', 'Ledger'],
  ['/inventory/purchase-invoices', 'Purchase Invoices'],
  ['/suppliers/vendor-outstanding', 'Vendor Outstanding'],
  ['/suppliers/purchase-register', 'Purchase Register'],
  ['/suppliers/vendor-payments', 'Vendor Payments'],
  ['/suppliers/advances', 'Supplier Advances'],
  ['/payroll/process', 'Payslips'],
  ['/staff/ledger', 'Staff Ledger'],
  ['/work-orders', 'Work Orders'],
  ['/complaints', 'Complaints'],
  ['/customers', 'Customers'],
  ['/inventory', 'Inventory'],
  ['/suppliers', 'Suppliers'],
  ['/attendance', 'Attendance'],
  ['/payroll', 'Payroll'],
  ['/staff', 'Staff'],
  ['/amc', 'AMC'],
  ['/reports', 'Reports'],
  ['/dashboard', 'Dashboard'],
]

/** A usable origin, or null. Rejects absolute URLs and protocol-relative paths. */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith('/')) return null
  if (value.startsWith('//')) return null
  return value
}

export function labelForPath(path: string): string {
  const match = LABELS.filter(([prefix]) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`))
    .sort((a, b) => b[0].length - a[0].length)[0]
  return match ? match[1] : 'Back'
}

/**
 * @param returnTo  raw `return_to` param, if any
 * @param fallbackHref  where Back goes when there is no origin — normally this
 *                      module's own list
 * @param fallbackLabel label to use with that fallback
 */
export function resolveBack(
  returnTo: string | null | undefined,
  fallbackHref: string,
  fallbackLabel = 'Back'
): { href: string; label: string } {
  const safe = safeReturnTo(returnTo)
  if (!safe) return { href: fallbackHref, label: fallbackLabel }
  return { href: safe, label: labelForPath(safe) }
}
