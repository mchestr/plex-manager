/**
 * What Prisma returns for a `select`, for mocks that should honour it: only
 * the keys the select turns on, or the whole row without one. A test that
 * stores a column a query must never read (a message's tool log) can then
 * show the query leaves it out.
 */
export function selected<T extends Record<string, unknown>>(row: T, select: Record<string, unknown> | undefined): Partial<T> {
  if (!select) return row
  return Object.fromEntries(Object.entries(select).filter(([, on]) => on).map(([key]) => [key, row[key]])) as Partial<T>
}
