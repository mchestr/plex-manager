/**
 * The watchlist sync counts in words, for the member's card and its toast
 * (GAP-02). A plain module, so the client card can read it.
 *
 * @example
 * ```ts
 * watchlistCountsText({ requested: 3, available: 12, alreadyRequested: 4, skipped: 2, notPermitted: 1 })
 * // "Requested 3, already on the server 12, already requested 4, skipped 2 (no TMDB match), not allowed 1"
 * ```
 *
 * @module lib/watchlist/summary
 */

export interface WatchlistCounts {
  requested: number
  available: number
  alreadyRequested: number
  skipped: number
  notPermitted: number
}

export const WATCHLIST_COUNT_PARTS: ReadonlyArray<{
  key: keyof WatchlistCounts
  testId: string
  text: (count: number) => string
}> = [
  { key: "requested", testId: "watchlist-sync-result-requested", text: (n) => `Requested ${n}` },
  { key: "available", testId: "watchlist-sync-result-available", text: (n) => `already on the server ${n}` },
  { key: "alreadyRequested", testId: "watchlist-sync-result-already-requested", text: (n) => `already requested ${n}` },
  { key: "skipped", testId: "watchlist-sync-result-skipped", text: (n) => `skipped ${n} (no TMDB match)` },
  { key: "notPermitted", testId: "watchlist-sync-result-not-permitted", text: (n) => `not allowed ${n}` },
]

/** Every count as one sentence. */
export function watchlistCountsText(counts: WatchlistCounts): string {
  return WATCHLIST_COUNT_PARTS.map((part) => part.text(counts[part.key])).join(", ")
}
