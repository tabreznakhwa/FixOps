/**
 * Canonical vendor (payables) ledger.
 *
 * The accounting journal is the only source. AP signs are:
 *   Credit = liability incurred (opening payable / purchase invoice)
 *   Debit  = liability settled (payment / discount / advance / reversal)
 *   Balance = Credit − Debit
 *
 * Purchase orders and supplier-advance application traces never become journal
 * entries, so they cannot be double-counted here. A cancellation is represented
 * by the immutable original posting plus a linked reversal posting.
 */

const PAGE_SIZE = 1000
const MAX_ROWS = 50_000

export type LedgerEntry = {
  id: string
  /** Accounting posting date (not the editable document date). */
  date: string
  documentDate: string | null
  narration: string
  supplier: string
  ref: string
  /** Payments / advances / discounts — reduces the payable. */
  debit: number
  /** Bills and purchase invoices — increases the payable. */
  credit: number
  /** Global, organization-wide accounting order. */
  seq: number
  provenance: 'live' | 'inferred'
  reversalOf: string | null
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
  /** Sources that failed validation/load. Non-empty means figures are incomplete. */
  failedSources: string[]
}

/** Previous calendar day, used to date the "Opening Balance b/f" row. */
function dayBefore(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d - 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function defaultNarration(row: PostingRow): string {
  if (row.event_type === 'reversal') return `Reversal${row.reference_number ? ` — ${row.reference_number}` : ''}`
  const label = row.event_type.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  return `${label}${row.reference_number ? ` — ${row.reference_number}` : ''}`
}

function finiteAmount(value: number | null): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

/** Normalize every AP calculation to KWD's three-decimal precision. */
export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

// Accounting metadata is introduced by migration 055 and intentionally uses a
// narrow local type instead of broad edits to the hand-maintained Database type.
type PostingRow = {
  id: string
  party_name: string | null
  posting_date: string | null
  document_date: string | null
  posting_sequence: number | null
  event_type: string
  debit_amount: number | null
  credit_amount: number | null
  reference_number: string | null
  description: string | null
  provenance: 'live' | 'inferred' | null
  reversal_of: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

type PageResult<T> = {
  data: T[] | null
  error: { message?: string } | null
}

/**
 * Supabase caps responses at 1,000 rows. Fetch the journal in stable pages and
 * report query failures/overflow rather than silently showing a partial balance.
 */
async function fetchPostingRows(
  admin: Admin,
  orgId: string,
  supplierId: string | undefined,
  failures: string[],
): Promise<PostingRow[]> {
  const rows: PostingRow[] = []

  for (let from = 0; from <= MAX_ROWS; from += PAGE_SIZE) {
    let query = admin
      .from('accounting_postings')
      .select('id, party_name, posting_date, document_date, posting_sequence, event_type, debit_amount, credit_amount, reference_number, description, provenance, reversal_of')
      .eq('organization_id', orgId)
      .eq('ledger', 'ap')
      .order('posting_date')
      .order('posting_sequence')
      .order('id')
      .range(from, from + PAGE_SIZE - 1)

    if (supplierId) query = query.eq('party_id', supplierId)

    let page: PageResult<PostingRow>
    try {
      page = await query
    } catch (error) {
      failures.push(`accounting postings: ${error instanceof Error ? error.message : 'query failed'}`)
      return rows
    }

    if (page.error) {
      failures.push(`accounting postings: ${page.error.message ?? 'query failed'}`)
      return rows
    }

    const chunk = page.data ?? []
    if (from === MAX_ROWS) {
      if (chunk.length > 0) {
        failures.push(`accounting postings (over ${MAX_ROWS.toLocaleString()} rows)`)
      }
      return rows
    }

    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) return rows
  }

  return rows
}

export async function buildVendorLedger(
  admin: Admin,
  orgId: string | undefined,
  opts: { supplierId?: string; from?: string; to?: string },
): Promise<VendorLedger> {
  const { supplierId, from, to } = opts
  const allTime = !from && !to
  const failures: string[] = []

  if (!orgId) {
    return {
      entries: [],
      periodOpeningBalance: 0,
      periodOpeningDate: null,
      periodDebit: 0,
      periodCredit: 0,
      closingBalance: 0,
      totalDebit: 0,
      totalCredit: 0,
      allTime,
      failedSources: ['organization'],
    }
  }

  const postingRows = await fetchPostingRows(admin, orgId, supplierId, failures)
  const malformed = postingRows.filter((row) => (
    !row.posting_date
    || !Number.isSafeInteger(Number(row.posting_sequence))
    || !row.provenance
  ))

  if (malformed.length > 0) {
    failures.push(`accounting postings (${malformed.length} row${malformed.length === 1 ? '' : 's'} missing posting metadata)`)
  }

  const all: LedgerEntry[] = postingRows
    .filter((row) => (
      Boolean(row.posting_date)
      && Number.isSafeInteger(Number(row.posting_sequence))
      && Boolean(row.provenance)
    ))
    .map((row) => ({
      id: row.id,
      date: row.posting_date as string,
      documentDate: row.document_date,
      narration: row.description || defaultNarration(row),
      supplier: row.party_name ?? '—',
      ref: row.reference_number ?? '—',
      debit: roundCurrency(finiteAmount(row.debit_amount)),
      credit: roundCurrency(finiteAmount(row.credit_amount)),
      seq: Number(row.posting_sequence),
      provenance: row.provenance as 'live' | 'inferred',
      reversalOf: row.reversal_of,
    }))
    .sort((a, b) => (
      a.date.localeCompare(b.date)
      || a.seq - b.seq
      || a.id.localeCompare(b.id)
    ))

  const totalDebit = roundCurrency(all.reduce((sum, entry) => sum + entry.debit, 0))
  const totalCredit = roundCurrency(all.reduce((sum, entry) => sum + entry.credit, 0))
  const closingBalance = roundCurrency(totalCredit - totalDebit)

  const before = allTime || !from ? [] : all.filter((entry) => entry.date < from)
  const periodOpeningBalance = roundCurrency(before.reduce(
    (sum, entry) => sum + entry.credit - entry.debit,
    0,
  ))

  const entries = allTime
    ? all
    : all.filter((entry) => (!from || entry.date >= from) && (!to || entry.date <= to))

  return {
    entries,
    periodOpeningBalance,
    periodOpeningDate: allTime || !from ? null : dayBefore(from),
    periodDebit: roundCurrency(entries.reduce((sum, entry) => sum + entry.debit, 0)),
    periodCredit: roundCurrency(entries.reduce((sum, entry) => sum + entry.credit, 0)),
    closingBalance,
    totalDebit,
    totalCredit,
    allTime,
    failedSources: failures,
  }
}
