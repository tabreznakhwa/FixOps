import { formatCurrency } from '@/lib/utils'

/**
 * Vendor (payables) ledger — the Cash Book pattern applied to supplier accounts.
 *
 * A supplier account is a liability, so the signs mirror the Cash Book's asset view:
 *   Credit (Cr) = bills raised against us (opening payables, POs, purchase invoices) — increases what we owe
 *   Debit  (Dr) = money/value going out (payments, discounts, advances)              — reduces what we owe
 *   Balance     = Cr − Dr = amount still owed (positive = we owe the vendor)
 *
 * Two data quirks this has to respect, or the balance silently goes wrong:
 *
 *  1. A *cash* purchase invoice auto-inserts a matching `supplier_payments` row
 *     (see api/purchase-invoices/route.ts). So cash invoices must be credited too —
 *     crediting only credit-type invoices would leave every cash purchase as an
 *     unmatched debit. Cash invoice = credit + debit = nets to zero, as it should.
 *
 *  2. Utilising a supplier advance inserts a `supplier_payments` row carrying
 *     `supplier_advance_id` (see api/supplier-advances/[id]/route.ts). The advance
 *     itself is already a debit, so those utilisation rows are excluded — counting
 *     both would deduct the same money twice.
 *
 * Read-only: this builds a view over existing rows and never writes.
 */

export type LedgerEntry = {
  date: string
  narration: string
  supplier: string
  ref: string
  /** Payments / advances / discounts — reduces the payable. */
  debit: number
  /** Bills, POs, purchase invoices — increases the payable. */
  credit: number
  /** Sort tiebreak so a bill precedes its settlement on the same date. */
  seq: number
}

export type VendorLedger = {
  entries: LedgerEntry[]
  /** Balance carried into the selected period (0 for all-time). */
  periodOpeningBalance: number
  periodOpeningDate: string | null
  periodDebit: number
  periodCredit: number
  /** All-time closing payable, independent of the selected period. */
  closingBalance: number
  totalDebit: number
  totalCredit: number
  allTime: boolean
  /** Sources that failed to load. Non-empty means the figures are incomplete. */
  failedSources: string[]
}

const MODE_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  knet: 'KNET',
  advance: 'Advance',
}

function modeLabel(mode: string | null): string {
  if (!mode) return 'Payment'
  return MODE_LABELS[mode] ?? mode.replace(/_/g, ' ')
}

/** Previous calendar day, used to date the "Opening Balance b/f" row. */
function dayBefore(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d - 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/**
 * A report must never take the page down, so a failing query degrades to no rows
 * rather than throwing. But silently dropping a source would show a confidently
 * wrong balance, so failures are counted and surfaced to the reader instead.
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

export async function buildVendorLedger(
  admin: Admin,
  orgId: string | undefined,
  opts: { supplierId?: string; from?: string; to?: string }
): Promise<VendorLedger> {
  const { supplierId, from, to } = opts
  const allTime = !from && !to

  // Always fetch all-time rows: the opening balance carried into the period is
  // derived from everything before `from`. Filtering in SQL would drop that history
  // and produce a running balance that starts from the wrong number.
  const scope = <T>(q: T): T => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let qq: any = q
    qq = qq.eq('organization_id', orgId)
    if (supplierId) qq = qq.eq('supplier_id', supplierId)
    return qq.limit(5000) as T
  }

  type OpeningRow = { bill_ref: string | null; bill_date: string; amount: number; suppliers: { supplier_name: string } | null }
  type PoRow = { po_number: string; purchase_date: string; total_amount: number; suppliers: { supplier_name: string } | null }
  type PiRow = {
    invoice_number: string; invoice_date: string; total_amount: number; payment_type: string
    supplier_name: string | null; suppliers: { supplier_name: string } | null
  }
  type PayRow = {
    payment_date: string; amount_paid: number; discount_amount: number | null
    payment_mode: string | null; reference_number: string | null; notes: string | null
    suppliers: { supplier_name: string } | null
  }
  type AdvRow = {
    advance_number: string; advance_date: string; amount: number
    payment_mode: string | null; reference_number: string | null
    suppliers: { supplier_name: string } | null
  }

  const failures: string[] = []

  const [openingRows, poRows, piRows, payRows, advRows] = await Promise.all([
    safeRows<OpeningRow>(
      scope(admin.from('opening_payables').select('bill_ref, bill_date, amount, suppliers(supplier_name)')),
      failures, 'opening payables'
    ),
    safeRows<PoRow>(
      scope(
        admin
          .from('purchase_orders')
          .select('po_number, purchase_date, total_amount, suppliers(supplier_name)')
          .not('status', 'in', '(cancelled)')
      ),
      failures, 'purchase orders'
    ),
    safeRows<PiRow>(
      scope(
        admin
          .from('purchase_invoices')
          .select('invoice_number, invoice_date, total_amount, payment_type, supplier_name, suppliers(supplier_name)')
          .neq('status', 'cancelled')
      ),
      failures, 'purchase invoices'
    ),
    safeRows<PayRow>(
      scope(
        admin
          .from('supplier_payments')
          .select('payment_date, amount_paid, discount_amount, payment_mode, reference_number, notes, suppliers(supplier_name)')
          // Exclude advance utilisations — the advance itself is already a debit.
          .is('supplier_advance_id', null)
      ),
      failures, 'payments'
    ),
    safeRows<AdvRow>(
      scope(
        admin
          .from('supplier_advances')
          .select('advance_number, advance_date, amount, payment_mode, reference_number, suppliers(supplier_name)')
          .eq('is_cancelled', false)
      ),
      failures, 'advances'
    ),
  ])

  const all: LedgerEntry[] = [
    ...openingRows.map((r) => ({
      date: r.bill_date,
      narration: `Opening Payable${r.bill_ref ? ` — ${r.bill_ref}` : ''}`,
      supplier: r.suppliers?.supplier_name ?? '—',
      ref: r.bill_ref ?? '—',
      debit: 0,
      credit: Number(r.amount ?? 0),
      seq: 0,
    })),
    ...poRows.map((r) => ({
      date: r.purchase_date,
      narration: `Purchase Order ${r.po_number}`,
      supplier: r.suppliers?.supplier_name ?? '—',
      ref: r.po_number,
      debit: 0,
      credit: Number(r.total_amount ?? 0),
      seq: 0,
    })),
    ...piRows.map((r) => ({
      date: r.invoice_date,
      narration: `Purchase Invoice ${r.invoice_number}${r.payment_type === 'cash' ? ' (Cash)' : ''}`,
      supplier: r.suppliers?.supplier_name ?? r.supplier_name ?? '—',
      ref: r.invoice_number,
      debit: 0,
      credit: Number(r.total_amount ?? 0),
      seq: 0,
    })),
    ...payRows.map((r) => {
      const discount = Number(r.discount_amount ?? 0)
      return {
        date: r.payment_date,
        narration: `Payment — ${modeLabel(r.payment_mode)}${discount > 0 ? ` (incl. ${formatCurrency(discount)} discount)` : ''}`,
        supplier: r.suppliers?.supplier_name ?? '—',
        ref: r.reference_number ?? '—',
        // A discount settles the bill without cash leaving, so it still reduces the payable.
        debit: Number(r.amount_paid ?? 0) + discount,
        credit: 0,
        seq: 1,
      }
    }),
    ...advRows.map((r) => ({
      date: r.advance_date,
      narration: `Advance Paid — ${r.advance_number} (${modeLabel(r.payment_mode)})`,
      supplier: r.suppliers?.supplier_name ?? '—',
      ref: r.reference_number ?? r.advance_number,
      debit: Number(r.amount ?? 0),
      credit: 0,
      seq: 1,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq)

  const totalDebit = all.reduce((s, e) => s + e.debit, 0)
  const totalCredit = all.reduce((s, e) => s + e.credit, 0)
  const closingBalance = totalCredit - totalDebit

  // Balance carried in from everything dated before the period start.
  const before = allTime || !from ? [] : all.filter((e) => e.date < from)
  const periodOpeningBalance = before.reduce((s, e) => s + e.credit - e.debit, 0)

  const entries = allTime
    ? all
    : all.filter((e) => (!from || e.date >= from) && (!to || e.date <= to))

  return {
    entries,
    periodOpeningBalance,
    periodOpeningDate: allTime || !from ? null : dayBefore(from),
    periodDebit: entries.reduce((s, e) => s + e.debit, 0),
    periodCredit: entries.reduce((s, e) => s + e.credit, 0),
    closingBalance,
    totalDebit,
    totalCredit,
    allTime,
    failedSources: failures,
  }
}
