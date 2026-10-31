import "server-only"

import { z } from "zod"

import { bounded, displayName, mediaStatus, optNumber, optObject, optString, projectRequest, requestSchema } from "./overseerr-projections"

/**
 * The Overseerr list tools' replies: one page of requests, discovery results
 * or users, with the total, a "showing N of M" line and, when more follow,
 * how many and which page has them. A payload of another shape is
 * `undefined`, which the executor reports as an unexpected response.
 *
 * @module
 */

interface Paging {
  listed: number
  total: number
  page: number
  pageSize: number
  /** The last page the service serves, when it is short of what the total needs (TMDB stops at 500). */
  lastPage?: number
  /** Added to the `next` line: other ways to narrow the list. */
  hint?: string
}

/** The total, what this page shows of it and how to see the rest. */
function pageLines({ listed, total, page, pageSize, lastPage = Number.POSITIVE_INFINITY, hint = "" }: Paging) {
  const first = (page - 1) * pageSize
  const after = Math.max(0, total - first - listed)
  return {
    total,
    showing: page === 1 || listed === 0 ? `showing ${listed} of ${total}` : `showing ${first + 1}-${first + listed} of ${total}`,
    ...(after > 0 ? { more: `and ${after} more` } : {}),
    ...(after > 0 && page < lastPage ? { next: `pass page ${page + 1} for the next ${Math.min(pageSize, after)}${hint}` } : {}),
  }
}

/** At least what this page and the ones before it hold, when the reported total is missing or short. */
const totalOf = (reported: number | undefined, page: number, pageSize: number, listed: number) =>
  Math.max(reported ?? 0, (page - 1) * pageSize + listed)

const requestPageSchema = z.object({
  pageInfo: optObject(z.looseObject({ results: optNumber })),
  results: z.array(requestSchema),
})

/** Page `page` of `pageSize` requests. */
export function projectRequestPage(data: unknown, page: number, pageSize: number, hint?: string) {
  const parsed = requestPageSchema.safeParse(data)
  if (!parsed.success) return undefined
  const { pageInfo, results } = parsed.data
  const total = totalOf(pageInfo?.results, page, pageSize, results.length)
  return { ...pageLines({ listed: results.length, total, page, pageSize, hint }), requests: results.map(projectRequest) }
}

/** TMDB's results per page, and the last page it serves. */
const TMDB_PAGE_SIZE = 20
export const DISCOVER_LAST_PAGE = 500
const DISCOVER_OVERVIEW_MAX = 200

const discoverSchema = z.object({
  totalPages: optNumber,
  totalResults: optNumber,
  results: z.array(
    z.looseObject({
      id: z.number(),
      title: optString,
      name: optString,
      releaseDate: optString,
      firstAirDate: optString,
      overview: optString,
      voteAverage: optNumber,
      mediaInfo: optObject(z.looseObject({ status: optNumber })),
    })
  ),
})

/** Page `page` of discovery: each title's TMDB id, name, date, a short overview, TMDB rating and availability. */
export function projectDiscoverPage(data: unknown, page: number, kind: "movie" | "tv") {
  const parsed = discoverSchema.safeParse(data)
  if (!parsed.success) return undefined
  const { totalPages, totalResults, results } = parsed.data
  const lastPage = Math.min(totalPages ?? DISCOVER_LAST_PAGE, DISCOVER_LAST_PAGE)
  const total = totalOf(totalResults, page, TMDB_PAGE_SIZE, results.length)
  return {
    ...pageLines({ listed: results.length, total, page, pageSize: TMDB_PAGE_SIZE, lastPage }),
    results: results.map((item) => ({
      tmdbId: item.id,
      ...(kind === "movie" ? { title: item.title, releaseDate: item.releaseDate } : { name: item.name, firstAirDate: item.firstAirDate }),
      overview: bounded(item.overview, DISCOVER_OVERVIEW_MAX),
      rating: item.voteAverage === undefined ? undefined : Math.round(item.voteAverage * 10) / 10,
      // Overseerr has no record of a title nobody requested and Plex does not have
      status: mediaStatus(item.mediaInfo?.status ?? 1),
    })),
  }
}

/** The page size `userPagePath` asks Overseerr for. */
const USER_PAGE_SIZE = 100

const userPageSchema = z.object({
  pageInfo: optObject(z.looseObject({ results: optNumber, pageSize: optNumber })),
  results: z.array(z.looseObject({ id: z.number(), displayName: optString, requestCount: optNumber, permissions: optNumber })),
})

/**
 * Page `page` of users, without emails. A first page that holds every user
 * is just `total` and `users`; otherwise the paging lines say how many more
 * there are and which page has them.
 */
export function projectUserPage(data: unknown, page: number) {
  const parsed = userPageSchema.safeParse(data)
  if (!parsed.success) return undefined
  const { pageInfo, results } = parsed.data
  const pageSize = pageInfo?.pageSize ?? USER_PAGE_SIZE
  const total = totalOf(pageInfo?.results, page, pageSize, results.length)
  return {
    ...(page > 1 || total > results.length ? pageLines({ listed: results.length, total, page, pageSize }) : { total }),
    users: results.map((user) => ({
      id: user.id,
      displayName: displayName(user),
      requestCount: user.requestCount ?? 0,
      permissions: user.permissions ?? 0,
    })),
  }
}
