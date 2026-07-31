/**
 * Vendor-wise bill-wise outstanding — the classic ERP payables report.
 *
 * Bills are grouped under each vendor, oldest first, carrying a running
 * cumulative balance within the group, a per-vendor subtotal and a grand total.
 *
 * "As On" semantics:
 *   - only bills dated on or before the as-on date are listed;
 *   - the outstanding figure is restated to that date by adding back any
 *     settlement recorded *after* it. With the default (today) nothing is added
 *     back, so the figures are exactly the live balances.
 *
 * Read-only: builds a view over existing rows, never writes.
 */

export type OutstandingBill = {
  kind: 'opening' | 'invoice' | 'po'
  id: string
  billNo: string
  billDate: string
  refNo: string | null
  dueDate: string | null
  amount: number
  outstanding: number
  /** Cumulative outstanding within the vendor group. */
  balance: number
  /** Days the bill has been outstanding as at the as-on date (inclusive). */
  intDays: number
  href: string | null
}

export type VendorGroup = {
  supplierId: string
  supplierName: string
  supplierCode: string | null
  bills: OutstandingBill[]
  total: number
}

export type VendorWiseOutstanding = {
  asOn: string
  groups: VendorGroup[]
  grandTotal: number
  billCount: number
  /** True when figures were restated to a past date rather than read live. */
  restated: boolean
  /** Sources that failed to load. Non-empty means the figures are incomplete. */
  failedSources: string[]
}

/** Whole days between two ISO dates (b − a). */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

/**
 * Degrade to no rows rather than taking the page down, but record the failure —
 * silently dropping a source would show a confidently wrong outstanding total.
 */
async function safeRows<T>(
  q: PromiseLike<{ data: T[] | null; error: unknown }>,
  failures: string[],
  source: string
): Promise<T[]> {
  try {
    const { data, error } = await q
    if (error) { failures.push(source); return [] }
    return data ?? []
  } catch {
    failures.push(source)
    return []
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

type SupplierRef = { id?: string; supplier_name?: string; supplier_code?: string } | null

export async function buildVendorWiseOutstanding(
  admin: Admin,
  orgId: string | undefined,
  opts: { supplierId?: string; asOn: string; q?: string }
): Promise<VendorWiseOutstanding> {
  const { supplierId, asOn } = opts

  const scope = <T>(q: T): T => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let qq: any = q
    qq = qq.eq('organization_id', orgId)
    if (supplierId) qq = qq.eq('supplier_id', supplierId)
    return qq.limit(2000) as T
  }

  type OpeningRow = {
    id: string; bill_ref: string | null; bill_date: string; due_date: string | null
    amount: number; balance_due: number; supplier_id: string | null; suppliers: SupplierRef
  }
  type PiRow = {
    id: string; invoice_number: string; invoice_date: string; due_date: string | null
    total_amount: number; balance_due: number; status: string; payment_type: string
    supplier_invoice_number: string | null; supplier_id: string | null
    supplier_name: string | null; suppliers: SupplierRef
  }
  type PoRow = {
    id: string; po_number: string; purchase_date: string; due_date: string | null
    total_amount: number; balance_due: number; status: string
    supplier_invoice_number: string | null; supplier_id: string | null; suppliers: SupplierRef
  }
  type PayRow = {
    purchase_invoice_id: string | null; purchase_order_id: string | null
    reference_number: string | null; supplier_id: string | null
    payment_date: string; amount_paid: number; discount_amount: number | null
  }

  const failures: string[] = []

  const [openingRows, piRows, poRows, laterPayments] = await Promise.all([
    safeRows<OpeningRow>(
      scope(
        admin
          .from('opening_payables')
          .select('id, bill_ref, bill_date, due_date, amount, balance_due, supplier_id, suppliers(id, supplier_name, supplier_code)')
          .lte('bill_date', asOn)
      ),
      failures, 'opening payables'
    ),
    safeRows<PiRow>(
      scope(
        admin
          .from('purchase_invoices')
          .select('id, invoice_number, invoice_date, due_date, total_amount, balance_due, status, payment_type, supplier_invoice_number, supplier_id, supplier_name, suppliers(id, supplier_name, supplier_code)')
          .eq('payment_type', 'credit')
          .neq('status', 'cancelled')
          .lte('invoice_date', asOn)
      ),
      failures, 'purchase invoices'
    ),
    safeRows<PoRow>(
      scope(
        admin
          .from('purchase_orders')
          .select('id, po_number, purchase_date, due_date, total_amount, balance_due, status, supplier_invoice_number, supplier_id, suppliers(id, supplier_name, supplier_code)')
          .not('status', 'in', '(cancelled)')
          .lte('purchase_date', asOn)
      ),
      failures, 'purchase orders'
    ),
    // Settlements recorded after the as-on date, added back to restate balances.
    // Empty for the default (as-on = today), so the common case stays exact.
    safeRows<PayRow>(
      scope(
        admin
          .from('supplier_payments')
          .select('purchase_invoice_id, purchase_order_id, reference_number, supplier_id, payment_date, amount_paid, discount_amount')
          .gt('payment_date', asOn)
      ),
      failures, 'later settlements'
    ),
  ])

  const restated = laterPayments.length > 0

  // Index later settlements so they can be added back onto the right bill.
  const settled = (amt: number, disc: number | null) => Number(amt ?? 0) + Number(disc ?? 0)
  const byInvoice = new Map<string, number>()
  const byPo = new Map<string, number>()
  // Opening payables carry no FK; the payment API stamps the bill_ref onto
  // reference_number, so match on that (scoped to the supplier).
  const byOpeningRef = new Map<string, number>()
  for (const p of laterPayments) {
    const v = settled(p.amount_paid, p.discount_amount)
    if (p.purchase_invoice_id) {
      byInvoice.set(p.purchase_invoice_id, (byInvoice.get(p.purchase_invoice_id) ?? 0) + v)
    } else if (p.purchase_order_id) {
      byPo.set(p.purchase_order_id, (byPo.get(p.purchase_order_id) ?? 0) + v)
    } else if (p.reference_number) {
      const k = `${p.supplier_id ?? ''}::${p.reference_number}`
      byOpeningRef.set(k, (byOpeningRef.get(k) ?? 0) + v)
    }
  }

  /** Outstanding restated to the as-on date, never above the bill's own value. */
  const restate = (balanceDue: number, amount: number, addBack: number) =>
    Math.min(Number(amount ?? 0), Number(balanceDue ?? 0) + addBack)

  const intDaysFor = (dueDate: string | null, billDate: string) => {
    const ref = dueDate ?? billDate
    const d = daysBetween(ref, asOn)
    // Inclusive of both endpoints, matching the ERP's interest-day count.
    return d >= 0 ? d + 1 : 0
  }

  type Row = OutstandingBill & { supplierId: string; supplierName: string; supplierCode: string | null }
  const rows: Row[] = []

  const push = (
    s: SupplierRef,
    fallbackId: string | null,
    fallbackName: string | null,
    bill: Omit<OutstandingBill, 'balance'>
  ) => {
    if (bill.outstanding <= 0.0005) return
    rows.push({
      ...bill,
      balance: 0,
      supplierId: s?.id ?? fallbackId ?? 'unknown',
      supplierName: s?.supplier_name ?? fallbackName ?? 'Unallocated',
      supplierCode: s?.supplier_code ?? null,
    })
  }

  for (const r of openingRows) {
    const key = `${r.supplier_id ?? ''}::${r.bill_ref ?? ''}`
    push(r.suppliers, r.supplier_id, null, {
      kind: 'opening',
      id: r.id,
      billNo: r.bill_ref ?? '—',
      billDate: r.bill_date,
      refNo: r.bill_ref,
      dueDate: r.due_date,
      amount: Number(r.amount ?? 0),
      outstanding: restate(r.balance_due, r.amount, byOpeningRef.get(key) ?? 0),
      intDays: intDaysFor(r.due_date, r.bill_date),
      href: null,
    })
  }

  for (const r of piRows) {
    push(r.suppliers, r.supplier_id, r.supplier_name, {
      kind: 'invoice',
      id: r.id,
      billNo: r.invoice_number,
      billDate: r.invoice_date,
      refNo: r.supplier_invoice_number,
      dueDate: r.due_date,
      amount: Number(r.total_amount ?? 0),
      outstanding: restate(r.balance_due, r.total_amount, byInvoice.get(r.id) ?? 0),
      intDays: intDaysFor(r.due_date, r.invoice_date),
      href: `/inventory/purchase-invoices/${r.id}`,
    })
  }

  for (const r of poRows) {
    push(r.suppliers, r.supplier_id, null, {
      kind: 'po',
      id: r.id,
      billNo: r.po_number,
      billDate: r.purchase_date,
      refNo: r.supplier_invoice_number,
      dueDate: r.due_date,
      amount: Number(r.total_amount ?? 0),
      outstanding: restate(r.balance_due, r.total_amount, byPo.get(r.id) ?? 0),
      intDays: intDaysFor(r.due_date, r.purchase_date),
      href: `/suppliers/po/${r.id}`,
    })
  }

  // Optional free-text narrowing on vendor / bill / reference.
  const q = opts.q?.toLowerCase().trim()
  const filtered = q
    ? rows.filter((r) =>
        r.supplierName.toLowerCase().includes(q) ||
        (r.supplierCode ?? '').toLowerCase().includes(q) ||
        r.billNo.toLowerCase().includes(q) ||
        (r.refNo ?? '').toLowerCase().includes(q)
      )
    : rows

  // Group by vendor, oldest bill first, accumulating the running balance.
  const byVendor = new Map<string, VendorGroup>()
  for (const r of filtered) {
    let g = byVendor.get(r.supplierId)
    if (!g) {
      g = { supplierId: r.supplierId, supplierName: r.supplierName, supplierCode: r.supplierCode, bills: [], total: 0 }
      byVendor.set(r.supplierId, g)
    }
    g.bills.push(r)
  }

  const groups = [...byVendor.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName))
  for (const g of groups) {
    g.bills.sort((a, b) => a.billDate.localeCompare(b.billDate) || a.billNo.localeCompare(b.billNo))
    let running = 0
    for (const b of g.bills) {
      running += b.outstanding
      b.balance = running
    }
    g.total = running
  }

  return {
    asOn,
    groups,
    grandTotal: groups.reduce((s, g) => s + g.total, 0),
    billCount: groups.reduce((s, g) => s + g.bills.length, 0),
    restated,
    failedSources: failures,
  }
}
