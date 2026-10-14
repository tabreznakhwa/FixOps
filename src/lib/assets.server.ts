const PAGE_SIZE = 1000
const MAX_ROWS = 50_000

// The hand-maintained Database type does not yet model all query-builder
// relations used by this server-only paging helper.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PostgrestClient = { from: (table: string) => any }

async function fetchAllAssetOptions<T>(
  client: PostgrestClient,
  table: 'suppliers' | 'staff',
  select: string,
  organizationId: string,
  statusColumn: 'status' | 'employment_status',
  orderColumn: string,
): Promise<T[]> {
  const all: T[] = []

  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .eq('organization_id', organizationId)
      .eq(statusColumn, 'active')
      .order(orderColumn)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)

    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  return all
}

export function fetchAllActiveAssetSuppliers(
  client: PostgrestClient,
  organizationId: string,
) {
  return fetchAllAssetOptions<{ id: string; supplier_name: string }>(
    client,
    'suppliers',
    'id, supplier_name',
    organizationId,
    'status',
    'supplier_name',
  )
}

export function fetchAllActiveAssetStaff(
  client: PostgrestClient,
  organizationId: string,
) {
  return fetchAllAssetOptions<{ id: string; full_name: string; staff_code: string | null }>(
    client,
    'staff',
    'id, full_name, staff_code',
    organizationId,
    'employment_status',
    'full_name',
  )
}

export type AssetDisposalBookRow = {
  disposal_date: string
  disposal_proceeds: number
  disposal_payment_method: string
  disposal_reference: string | null
  asset_code: string
  asset_name: string
}

export async function fetchAllAssetDisposalsForBook(
  client: PostgrestClient,
  organizationId: string,
  paymentMethods: string[],
  openingBalanceDate: string | null,
): Promise<AssetDisposalBookRow[]> {
  const all: AssetDisposalBookRow[] = []

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = client
      .from('assets')
      .select('disposal_date, disposal_proceeds, disposal_payment_method, disposal_reference, asset_code, asset_name')
      .eq('organization_id', organizationId)
      .eq('status', 'disposed')
      .in('disposal_payment_method', paymentMethods)
      .gt('disposal_proceeds', 0)

    if (openingBalanceDate) query = query.gte('disposal_date', openingBalanceDate)

    const { data, error } = await query
      .order('disposal_date', { ascending: true })
      .order('asset_code', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)

    const rows = (data ?? []) as AssetDisposalBookRow[]
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  return all
}
