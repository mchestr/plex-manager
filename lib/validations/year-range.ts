/** The first and last years a Rewind can be generated or opened for. Free of Zod, for client islands. */
export const YEAR_MIN = 2010
export const YEAR_MAX = 2100

/**
 * A `[year]` URL segment as a number, or null: the same rule as
 * `yearParamSchema` (four digits, `YEAR_MIN` to `YEAR_MAX`).
 *
 * @example
 * ```ts
 * readYearParam("2026") // 2026
 * readYearParam("26")   // null
 * ```
 */
export function readYearParam(value: string): number | null {
  if (!/^\d{4}$/.test(value)) return null
  const year = Number(value)
  return year >= YEAR_MIN && year <= YEAR_MAX ? year : null
}
