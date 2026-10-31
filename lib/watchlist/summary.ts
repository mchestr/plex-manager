/**
 * The watchlist sync counts in words, for the member's card and its toast
 * (GAP-02). A plain module, so the client card can read it.
 *
 * @example
 * ```ts
 * watchlistCountsText({ requested: 3, available: 12, alreadyRequested: 4, skipped: 2, notPermitted: 1 })
 * // "3 requested, 12 already on the server, 4 already requested, 2 couldn't be matched, 1 not allowed"
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
  { key: "requested", testId: "watchlist-sync-result-requested", text: (n) => `${n} requested` },
  { key: "available", testId: "watchlist-sync-result-available", text: (n) => `${n} already on the server` },
  { key: "alreadyRequested", testId: "watchlist-sync-result-already-requested", text: (n) => `${n} already requested` },
  { key: "skipped", testId: "watchlist-sync-result-skipped", text: (n) => `${n} couldn't be matched` },
  { key: "notPermitted", testId: "watchlist-sync-result-not-permitted", text: (n) => `${n} not allowed` },
]

/** Every count as one sentence. */
export function watchlistCountsText(counts: WatchlistCounts): string {
  return WATCHLIST_COUNT_PARTS.map((part) => part.text(counts[part.key])).join(", ")
}
