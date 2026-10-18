/**
 * A fake of how Prisma shapes a query result from its `select` / `include`.
 *
 * Mocked Prisma calls usually return a hand-written result, which hides what
 * the real query would leak. This applies the call's arguments to a full
 * fixture row instead, so a test sees exactly the columns the query asks for:
 *
 * - `select`: only the listed fields.
 * - `include` (or no shape): every scalar column plus the listed relations.
 * - A relation set to `true` returns all of the related row's scalar columns,
 *   as Prisma does, so `include: { user: true }` returns `plexAuthToken`.
 *
 * In a fixture row a relation is an array or a nested object (not a Date);
 * every other value is a scalar column. Other arguments (`orderBy`, `where`,
 * `take`) are ignored.
 *
 * @example
 * ```ts
 * const row = { id: 'i1', usages: [{ id: 'u1', user: { name: 'Ann', plexAuthToken: 't' } }] }
 * applyPrismaShape(row, { include: { usages: { include: { user: { select: { name: true } } } } } })
 * // { id: 'i1', usages: [{ id: 'u1', user: { name: 'Ann' } }] }
 * ```
 */

type Row = Record<string, unknown>
/** Query arguments; only `select` and `include` shape the result. */
type Shape = { select?: Row; include?: Row; [arg: string]: unknown }

function isRelation(value: unknown): boolean {
  return Array.isArray(value) || (value !== null && typeof value === 'object' && !(value instanceof Date))
}

function scalars(row: Row): Row {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => !isRelation(value)))
}

function shapeRelation(value: unknown, arg: unknown): unknown {
  if (value === null || value === undefined) return value
  const shapeOne = (related: Row) => (arg === true ? scalars(related) : applyPrismaShape(related, arg as Shape))
  return Array.isArray(value) ? value.map((related: Row) => shapeOne(related)) : shapeOne(value as Row)
}

export function applyPrismaShape(row: Row, shape: Shape = {}): Row {
  if (shape.select) {
    const selected: Row = {}
    for (const [key, arg] of Object.entries(shape.select)) {
      if (!arg) continue
      const value = row[key]
      selected[key] = isRelation(value) ? shapeRelation(value, arg) : value
    }
    return selected
  }

  const result = scalars(row)
  for (const [key, arg] of Object.entries(shape.include ?? {})) {
    if (arg) result[key] = shapeRelation(row[key], arg)
  }
  return result
}
