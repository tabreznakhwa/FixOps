/**
 * Fetches the full active customer list for dropdowns / comboboxes.
 *
 * Why this exists: PostgREST caps a single response at `db-max-rows` (1000 on
 * this project). Pages were asking for `.limit(5000).order('full_name')` and
 * silently receiving only the first 1000 rows — so once the org passed 1000
 * customers, everyone at the end of the alphabet became unselectable in every
 * dropdown in the app. There was no error; the name simply wasn't in the list.
 *
 * Paging with .range() keeps the whole list available regardless of the cap.
 *
 * Scaling note: this ships every customer to the browser. Fine at the current
 * ~1k (roughly 100KB); if the list reaches several thousand, move the combobox
 * to a server-side `ilike` search endpoint instead of growing the payload.
 */

/** PostgREST's per-response ceiling. Requesting more than this silently truncates. */
const PAGE_SIZE = 1000

/** Stops a runaway loop if the backend ever returns full pages indefinitely. */
const MAX_ROWS = 50_000

export async function fetchAllCustomers<T = Record<string, unknown>>(
  client: { from: (t: string) => any },
  select: string,
  opts: { organizationId?: string; activeOnly?: boolean } = {}
): Promise<T[]> {
  const { organizationId, activeOnly = true } = opts
  const all: T[] = []

  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    let q = client.from('customers').select(select)
    if (activeOnly) q = q.eq('status', 'active')
    if (organizationId) q = q.eq('organization_id', organizationId)

    const { data, error } = await q
      .order('full_name')
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      // Return what we have rather than blanking the page, but make the
      // truncation visible in logs — silent partial lists are the whole bug.
      console.error('fetchAllCustomers: page failed at offset', offset, error)
      break
    }

    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  return all
}
