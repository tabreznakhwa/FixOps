const PAGE_SIZE = 1000
const MAX_ROWS = 50_000

type PageResult<T> = {
  data: T[] | null
  error: { message?: string } | null
}

/**
 * Read a complete reporting source despite PostgREST's per-request row cap.
 * A source error or safety-limit overflow is surfaced to the caller so a
 * financial report never presents silently partial figures as complete.
 */
export async function readPagedRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<PageResult<T>>,
  failures: string[],
  source: string,
): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    try {
      const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
      if (error) {
        failures.push(`${source}: ${error.message ?? 'query failed'}`)
        return rows
      }
      const chunk = data ?? []
      rows.push(...chunk)
      if (chunk.length < PAGE_SIZE) return rows
    } catch (error) {
      failures.push(`${source}: ${error instanceof Error ? error.message : 'query failed'}`)
      return rows
    }
  }

  try {
    const { data, error } = await buildQuery(MAX_ROWS, MAX_ROWS)
    if (error) {
      failures.push(`${source}: ${error.message ?? 'overflow check failed'}`)
    } else if ((data?.length ?? 0) > 0) {
      failures.push(`${source}: exceeds ${MAX_ROWS.toLocaleString()}-row safety limit`)
    }
  } catch {
    failures.push(`${source}: overflow check failed`)
  }

  return rows
}
