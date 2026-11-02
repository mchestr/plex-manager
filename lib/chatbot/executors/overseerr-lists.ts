import "server-only"

import { z } from "zod"

import { bounded, displayName, mediaStatus, optNumber, optObject, optString, projectRequest, requestSchema } from "./overseerr-projections"

/**
 * The Overseerr list tools' replies: one page of requests, discovery results
 * or users, with the total, a "showing N of M" line and, when more follow,
 * how many and which page has them. A page past the end says so and names the
 * last page. A payload of another shape is `undefined`, which the executor
 * reports as an unexpected response.
 *
 * @module
 */

interface Paging {
  listed: number
  total: number
  page: number
  pageSize: number
  /** The last page the service serves, when the total can run past it (TMDB stops at 500), and the `next` line there. */
  cap?: { page: number; next: string }
  /** Added to the `next` line: other ways to narrow the list. */
  hint?: string
}

/** The total, what this page shows of it and how to see the rest. */
function pageLines({ listed, total, page, pageSize, cap, hint = "" }: Paging) {
  const lastPage = Math.min(Math.max(1, Math.ceil(total / pageSize)), cap?.page ?? Number.POSITIVE_INFINITY)
  if (listed === 0 && page > lastPage) return { total, showing: `page ${page} is past the end (last page ${lastPage})` }
  const first = (page - 1) * pageSize
  const after = Math.max(0, total - first - listed)
  const next = cap && page >= cap.page ? cap.next : `pass page ${page + 1} for the next ${Math.min(pageSize, after)}${hint}`
  return {
    total,
    showing: page === 1 || listed === 0 ? `showing ${listed} of ${total}` : `showing ${first + 1}-${first + listed} of ${total}`,
    ...(after > 0 ? { more: `and ${after} more`, next } : {}),
  }
}

/**
 * The reported total, raised to what this page and the ones before it hold
 * when it is missing or short. An empty page says nothing of the pages before
 * it, so past the end the reported total stands.
 */
const totalOf = (reported: number | undefined, page: number, pageSize: number, listed: number) =>
  listed > 0 ? Math.max(reported ?? 0, (page - 1) * pageSize + listed) : (reported ?? 0)

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
const DISCOVER_CAP = { page: DISCOVER_LAST_PAGE, next: `TMDB serves no page past ${DISCOVER_LAST_PAGE}; another sortBy lists other titles` }

const discoverSchema = z.object({
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

/**
 * Page `page` of discovery: each title's TMDB id, name, date, a short
 * overview, TMDB rating and availability. `asked` is the page the model asked
 * for; past TMDB's last page the executor reads that last page, and the reply
 * says so.
 */
export function projectDiscoverPage(data: unknown, page: number, kind: "movie" | "tv", asked = page) {
  const parsed = discoverSchema.safeParse(data)
  if (!parsed.success) return undefined
  const { totalResults, results } = parsed.data
  const total = totalOf(totalResults, page, TMDB_PAGE_SIZE, results.length)
  return {
    ...(asked > page ? { note: `page ${asked} is past the last page TMDB serves; this is page ${page}` } : {}),
    ...pageLines({ listed: results.length, total, page, pageSize: TMDB_PAGE_SIZE, cap: DISCOVER_CAP }),
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
