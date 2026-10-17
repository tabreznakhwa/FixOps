import { readPagedRows } from './reportPaging'

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
  kind: 'opening' | 'invoice'
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

export type PurchaseOrderCommitment = {
  id: string
  orderNo: string
  orderDate: string
  refNo: string | null
  dueDate: string | null
  amount: number
  href: string
}

export type VendorGroup = {
  supplierId: string
  supplierName: string
  supplierCode: string | null
  bills: OutstandingBill[]
  commitments: PurchaseOrderCommitment[]
  total: number
  commitmentTotal: number
}

export type VendorWiseOutstanding = {
  asOn: string
  groups: VendorGroup[]
  grandTotal: number
  billCount: number
  grandCommitmentTotal: number
  commitmentCount: number
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

type SupplierRef = { id?: string; supplier_name?: string; supplier_code?: string } | null

export async function buildVendorWiseOutstanding(
  admin: Admin,
  orgId: string | undefined,
  opts: { supplierId?: string; asOn: string; q?: string }
): Promise<VendorWiseOutstanding> {
  const { supplierId, asOn } = opts

  if (!orgId) {
    return {
      asOn,
      groups: [],
      grandTotal: 0,
      billCount: 0,
      grandCommitmentTotal: 0,
      commitmentCount: 0,
      restated: false,
      failedSources: ['organization scope is missing'],
    }
  }

  const scope = <T>(q: T): T => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let qq: any = q
    qq = qq.eq('organization_id', orgId)
    if (supplierId) qq = qq.eq('supplier_id', supplierId)
    return qq as T
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
    total_amount: number; status: string; supplier_id: string | null; suppliers: SupplierRef
    purchase_order_items: Array<{
      quantity: number
      quantity_received: number
      unit_cost: number
    }> | null
  }
  type PayRow = {
    id: string; purchase_invoice_id: string | null
    opening_payable_id: string | null; supplier_advance_id: string | null
    payment_date: string; amount_paid: number; discount_amount: number | null
  }

  const failures: string[] = []

  const [openingRows, piRows, poRows, laterPayments] = await Promise.all([
    readPagedRows<OpeningRow>(
      (from, to) => scope(
        admin
          .from('opening_payables')
          .select('id, bill_ref, bill_date, due_date, amount, balance_due, supplier_id, suppliers(id, supplier_name, supplier_code)')
          .is('reversal_posting_id', null)
          .lte('bill_date', asOn)
          .order('bill_date')
          .order('id')
      ).range(from, to),
      failures,
      'opening payables',
    ),
    readPagedRows<PiRow>(
      (from, to) => scope(
        admin
          .from('purchase_invoices')
          .select('id, invoice_number, invoice_date, due_date, total_amount, balance_due, status, payment_type, supplier_invoice_number, supplier_id, supplier_name, suppliers(id, supplier_name, supplier_code)')
          .eq('payment_type', 'credit')
          .neq('status', 'cancelled')
          .lte('invoice_date', asOn)
          .order('invoice_date')
          .order('id')
      ).range(from, to),
      failures,
      'purchase invoices',
    ),
    readPagedRows<PoRow>(
      (from, to) => scope(
        admin
          .from('purchase_orders')
          .select('id, po_number, purchase_date, due_date, total_amount, status, supplier_id, suppliers(id, supplier_name, supplier_code), purchase_order_items(quantity, quantity_received, unit_cost)')
          .in('status', ['draft', 'submitted', 'partial'])
          .lte('purchase_date', asOn)
          .order('purchase_date')
          .order('id')
      ).range(from, to),
      failures,
      'purchase orders',
    ),
    // Only active, independently posted settlements are added back. Supplier
    // advance allocation traces are operational links, not second cash events.
    readPagedRows<PayRow>(
      (from, to) => scope(
        admin
          .from('supplier_payments')
          .select('id, purchase_invoice_id, opening_payable_id, supplier_advance_id, payment_date, amount_paid, discount_amount')
          .eq('is_cancelled', false)
          .is('supplier_advance_id', null)
          .gt('payment_date', asOn)
          .order('payment_date')
          .order('id')
      ).range(from, to),
      failures,
      'later settlements',
    ),
  ])

  const restated = laterPayments.length > 0

  // Index later settlements so they can be added back onto the right bill.
  const settled = (amt: number, disc: number | null) => Number(amt ?? 0) + Number(disc ?? 0)
  const byInvoice = new Map<string, number>()
  const byOpening = new Map<string, number>()
  for (const payment of laterPayments) {
    const value = settled(payment.amount_paid, payment.discount_amount)
    if (payment.purchase_invoice_id) {
      byInvoice.set(
        payment.purchase_invoice_id,
        (byInvoice.get(payment.purchase_invoice_id) ?? 0) + value,
      )
    } else if (payment.opening_payable_id) {
      byOpening.set(
        payment.opening_payable_id,
        (byOpening.get(payment.opening_payable_id) ?? 0) + value,
      )
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
  type CommitmentRow = PurchaseOrderCommitment & { supplierId: string; supplierName: string; supplierCode: string | null }
  const rows: Row[] = []
  const commitments: CommitmentRow[] = []

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
    push(r.suppliers, r.supplier_id, null, {
      kind: 'opening',
      id: r.id,
      billNo: r.bill_ref ?? '—',
      billDate: r.bill_date,
      refNo: r.bill_ref,
      dueDate: r.due_date,
      amount: Number(r.amount ?? 0),
      outstanding: restate(r.balance_due, r.amount, byOpening.get(r.id) ?? 0),
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

  for (const row of poRows) {
    const amount = row.purchase_order_items?.length
      ? row.purchase_order_items.reduce((sum, item) => {
          const remainingQuantity = Math.max(0, Number(item.quantity ?? 0) - Number(item.quantity_received ?? 0))
          return sum + remainingQuantity * Number(item.unit_cost ?? 0)
        }, 0)
      : Number(row.total_amount ?? 0)
    if (amount <= 0.0005) continue
    commitments.push({
      id: row.id,
      orderNo: row.po_number,
      orderDate: row.purchase_date,
      refNo: null,
      dueDate: row.due_date,
      amount,
      href: `/suppliers/po/${row.id}`,
      supplierId: row.suppliers?.id ?? row.supplier_id ?? 'unknown',
      supplierName: row.suppliers?.supplier_name ?? 'Unallocated',
      supplierCode: row.suppliers?.supplier_code ?? null,
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
  const filteredCommitments = q
    ? commitments.filter((row) =>
        row.supplierName.toLowerCase().includes(q) ||
        (row.supplierCode ?? '').toLowerCase().includes(q) ||
        row.orderNo.toLowerCase().includes(q) ||
        (row.refNo ?? '').toLowerCase().includes(q)
      )
    : commitments

  // Group by vendor, keeping AP bills and PO commitments explicitly separate.
  const byVendor = new Map<string, VendorGroup>()
  const getGroup = (row: { supplierId: string; supplierName: string; supplierCode: string | null }) => {
    let group = byVendor.get(row.supplierId)
    if (!group) {
      group = {
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        supplierCode: row.supplierCode,
        bills: [],
        commitments: [],
        total: 0,
        commitmentTotal: 0,
      }
      byVendor.set(row.supplierId, group)
    }
    return group
  }
  for (const row of filtered) {
    getGroup(row).bills.push(row)
  }
  for (const row of filteredCommitments) {
    getGroup(row).commitments.push(row)
  }

  const groups = [...byVendor.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName))
  for (const group of groups) {
    group.bills.sort((a, b) => a.billDate.localeCompare(b.billDate) || a.billNo.localeCompare(b.billNo))
    let running = 0
    for (const bill of group.bills) {
      running += bill.outstanding
      bill.balance = running
    }
    group.total = running
    group.commitments.sort((a, b) => a.orderDate.localeCompare(b.orderDate) || a.orderNo.localeCompare(b.orderNo))
    group.commitmentTotal = group.commitments.reduce((sum, row) => sum + row.amount, 0)
  }

  return {
    asOn,
    groups,
    grandTotal: groups.reduce((sum, group) => sum + group.total, 0),
    billCount: groups.reduce((sum, group) => sum + group.bills.length, 0),
    grandCommitmentTotal: groups.reduce((sum, group) => sum + group.commitmentTotal, 0),
    commitmentCount: groups.reduce((sum, group) => sum + group.commitments.length, 0),
    restated,
    failedSources: failures,
  }
}
