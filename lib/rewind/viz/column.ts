/**
 * Taste's genre column (design 4.3 page 07, "column inches"): one
 * full-width row per genre, at most five, each a bar whose length is its
 * share against the top genre's. The top genre prints solid, the rest
 * hatched.
 *
 * ```
 *  Drama                                41%
 *  ████████████████████████████████████████
 *  Comedy                               22%
 *  ▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨
 * ```
 *
 * Pure geometry, client-safe.
 *
 * @module lib/rewind/viz/column
 */

export interface ColumnBar {
  /** The bar's length in px, at least 2 so a tiny share still prints. */
  width: number
  solid: boolean
}

const MAX_BARS = 5
const MIN_WIDTH = 2

const r = (n: number) => Math.round(n * 100) / 100

/**
 * @example
 * ```ts
 * genreColumn([0.41, 0.22], { measure: 358 }) // [{ width: 358, solid: true }, { width: 192.1, solid: false }]
 * ```
 */
export function genreColumn(shares: readonly number[], { measure }: { measure: number }): ColumnBar[] {
  const top = Math.max(...shares.slice(0, MAX_BARS), 0)
  return shares.slice(0, MAX_BARS).map((share, i) => ({
    width: top > 0 ? Math.max(MIN_WIDTH, r((share / top) * measure)) : MIN_WIDTH,
    solid: i === 0,
  }))
}
