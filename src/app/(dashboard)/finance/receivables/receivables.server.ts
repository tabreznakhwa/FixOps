const PAGE_SIZE = 1000
const MAX_ROWS = 50_000

// opening_receivables and joined relation projections are not fully represented
// in the hand-maintained Database type used by this project.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PostgrestClient = { from: (table: string) => any }

export type ReceivableInvoiceRecord = {
  id: string
  invoice_number: string
  customer_id: string
  balance_due: number
  due_date: string | null
  status: string
  invoice_date: string
  customers: {
    id: string
    full_name: string
    mobile_number: string
    area: string | null
  } | null
}

export type OpeningReceivableRecord = {
  id: string
  invoice_ref: string | null
  customer_id: string
  balance_due: number
  due_date: string | null
  invoice_date: string
  customers: {
    id: string
    full_name: string
    mobile_number: string
    area: string | null
  } | null
}

export type ReceivableSourceResult<T> = {
  rows: T[]
  error: string | null
}

async function fetchReceivablePages<T extends { customer_id: string; id: string }>(
  client: PostgrestClient,
  source: 'invoices' | 'opening_receivables',
  select: string,
): Promise<ReceivableSourceResult<T>> {
  const rows: T[] = []
  let cursor: { customerId: string; id: string } | null = null
  const label = source === 'invoices'
    ? 'receivable invoices'
    : 'opening receivables'

  try {
    while (rows.length < MAX_ROWS) {
      let query = client
        .from(source)
        .select(select)
        .gt('balance_due', 0)
        .order('customer_id', { ascending: true })
        .order('id', { ascending: true })
        .limit(PAGE_SIZE)

      if (source === 'invoices') {
        query = query.in('status', ['issued', 'partial', 'overdue'])
      }

      // Keyset paging avoids offset drift if a receivable is inserted or removed
      // while this multi-page read is in progress.
      if (cursor) {
        query = query.or(
          `customer_id.gt.${cursor.customerId},and(customer_id.eq.${cursor.customerId},id.gt.${cursor.id})`,
        )
      }

      const { data, error } = await query
      if (error) {
        return { rows, error: `Failed to load ${label}: ${error.message}` }
      }

      const page = (data ?? []) as T[]
      rows.push(...page)
      if (page.length < PAGE_SIZE) return { rows, error: null }

      const last = page.at(-1)
      if (!last) return { rows, error: null }
      cursor = { customerId: last.customer_id, id: last.id }
    }

    let probe = client
      .from(source)
      .select('id')
      .gt('balance_due', 0)
      .order('customer_id', { ascending: true })
      .order('id', { ascending: true })
      .limit(1)

    if (source === 'invoices') {
      probe = probe.in('status', ['issued', 'partial', 'overdue'])
    }
    if (cursor) {
      probe = probe.or(
        `customer_id.gt.${cursor.customerId},and(customer_id.eq.${cursor.customerId},id.gt.${cursor.id})`,
      )
    }

    const { data: extra, error: probeError } = await probe
    if (probeError) {
      return { rows, error: `Failed to verify ${label} safety limit: ${probeError.message}` }
    }
    if ((extra ?? []).length > 0) {
      return {
        rows,
        error: `${label} exceed the ${MAX_ROWS.toLocaleString('en-US')}-row safety limit`,
      }
    }

    return { rows, error: null }
  } catch (error) {
    return {
      rows,
      error: error instanceof Error ? error.message : `Failed to load ${label}`,
    }
  }
}

export function fetchAllReceivableInvoices(client: PostgrestClient) {
  return fetchReceivablePages<ReceivableInvoiceRecord>(
    client,
    'invoices',
    'id, invoice_number, customer_id, balance_due, due_date, status, invoice_date, customers(id, full_name, mobile_number, area)',
  )
}

export function fetchAllOpeningReceivables(client: PostgrestClient) {
  return fetchReceivablePages<OpeningReceivableRecord>(
    client,
    'opening_receivables',
    'id, invoice_ref, customer_id, balance_due, due_date, invoice_date, customers(id, full_name, mobile_number, area)',
  )
}
