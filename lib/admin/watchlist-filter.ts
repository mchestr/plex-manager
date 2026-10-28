/**
 * The admin watchlist list's URL filters and sorts (`/admin/watchlist`), as
 * pure functions the page, its loader and the table share.
 *
 * ## Filters
 *
 * `?q=` searches the title and the member's name and email, ignoring case.
 * `?status=` and `?type=` default to `all` (UI-05); anything unrecognised in
 * the URL falls back to it.
 *
 * | Param    | Values                                                                                    |
 * |----------|-------------------------------------------------------------------------------------------|
 * | `status` | `all`, `requested`, `available`, `alreadyRequested`, `notAllowed`, `noMatch`, `failed`, `removed` |
 * | `type`   | `all`, `movie`, `tv`                                                                      |
 *
 * Each status names one `WatchlistSyncStatus`. `SYNCED`, which no sync writes
 * any more, is listed under All only.
 *
 * ## Sorts
 *
 * `synced` (the default, newest first), `title`, `member` and `requested`,
 * each with the row id as the tie-break so a page never reshuffles.
 *
 * @module lib/admin/watchlist-filter
 */

import { z } from "zod"

import type { MediaType, WatchlistSyncStatus } from "@/lib/generated/prisma/client"
import type { TableSort } from "@/lib/ui/table-params"

export const WATCHLIST_SORTS = ["synced", "title", "member", "requested"] as const
export const WATCHLIST_DEFAULT_SORT: TableSort = { id: "synced", desc: true }

const STATUSES = ["all", "requested", "available", "alreadyRequested", "notAllowed", "noMatch", "failed", "removed"] as const
const TYPES = ["all", "movie", "tv"] as const

const watchlistFilterSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  status: z.enum(STATUSES).catch("all"),
  type: z.enum(TYPES).catch("all"),
})

export type WatchlistFilter = z.infer<typeof watchlistFilterSchema>

/** The history status each `?status=` value lists, in the order the filter offers them. */
export const WATCHLIST_STATUS_OF = {
  requested: "REQUESTED",
  available: "ALREADY_AVAILABLE",
  alreadyRequested: "ALREADY_REQUESTED",
  notAllowed: "NOT_PERMITTED",
  noMatch: "SKIPPED_NO_EXTERNAL_ID",
  failed: "FAILED",
  removed: "REMOVED_FROM_WATCHLIST",
} as const satisfies Record<Exclude<WatchlistFilter["status"], "all">, WatchlistSyncStatus>

/** The media type each `?type=` value lists. */
export const WATCHLIST_TYPE_OF = {
  movie: "MOVIE",
  tv: "TV_SERIES",
} as const satisfies Record<Exclude<WatchlistFilter["type"], "all">, MediaType>

type Params = Record<string, string | string[] | undefined>

/** The filters from a page's `searchParams`, each `all` (and `q` empty) unless the URL says otherwise. */
export function parseWatchlistFilter(params: Params): WatchlistFilter {
  const first = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }
  return watchlistFilterSchema.parse({ q: first("q") ?? "", status: first("status"), type: first("type") })
}
