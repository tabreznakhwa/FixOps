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
