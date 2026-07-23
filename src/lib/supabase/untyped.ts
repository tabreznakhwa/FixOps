export type UntypedSupabaseClient = {
  from(table: string): UntypedQueryBuilder
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>
}

export type UntypedQueryBuilder = PromiseLike<{ data: unknown; error: unknown }> & {
  select(columns?: string): UntypedQueryBuilder
  insert(values: Record<string, unknown> | Record<string, unknown>[]): UntypedQueryBuilder
  update(values: Record<string, unknown>): UntypedQueryBuilder
  delete(): UntypedQueryBuilder
  eq(column: string, value: unknown): UntypedQueryBuilder
  not(column: string, operator: string, value: unknown): UntypedQueryBuilder
  order(column: string, options?: { ascending?: boolean }): UntypedQueryBuilder
  limit(count: number): UntypedQueryBuilder
  single(): Promise<{ data: unknown; error: unknown }>
  maybeSingle(): Promise<{ data: unknown; error: unknown }>
}
