/**
 * Media requests from Overseerr (design 7.2, RWP-06).
 *
 * - The member's Overseerr account is the one whose `plexId` equals their
 *   `plexUserId`, found by paging `/api/v1/user`. There is no email fallback:
 *   members without a Plex identity are not eligible for Rewind.
 * - Requests are paged newest first with `filter=all` (by `requestedBy` for a
 *   member) and kept when created inside the window; paging stops at the
 *   first page that reaches back before it. `/api/v1/request/count` is never
 *   used: it is all-time and server-wide.
 * - Statuses map through `toRequestEvent` (`./request-event.ts`).
 * - A member's request genres come from `/api/v1/movie/{tmdbId}` and
 *   `/api/v1/tv/{tmdbId}`, looked up once per title per batch through a
 *   {@link GenreCache}. A failed lookup leaves the genres empty.
 *
 * @module lib/wrapped/sources/overseerr-requests
 */

import "server-only"

import type { z } from "zod"

import { serviceFetch } from "@/lib/connections/http"
import { inWindow, type TimeWindow } from "@/lib/wrapped/time/zone"

import { parseRows, tooManyInvalid, type RowTally } from "./rows"
import { toRequestEvent, type RequestEvent } from "./request-event"
import {
  overseerrMediaDetailSchema,
  overseerrRequestPageSchema,
  overseerrRequestSchema,
  overseerrUserPageSchema,
} from "./schemas"
import { runLimited, type SourceContext, type SourceResult } from "./watch-history-source"

const PAGE_SIZE = 100
const MAX_PAGES = 200
const TIMEOUT_MS = 10_000

export interface OverseerrEndpoint {
  url: string
  apiKey: string
}

/** Genres by `movie:<tmdbId>` or `tv:<tmdbId>`, shared by every member in a batch. */
export type GenreCache = Map<string, string[]>

function get<T>(config: OverseerrEndpoint, path: string, schema: z.ZodType<T>, ctx: SourceContext) {
  return runLimited(ctx, "overseerr", () =>
    serviceFetch({
      service: "Overseerr",
      url: `${config.url.replace(/\/+$/, "")}/api/v1${path}`,
      headers: { "X-Api-Key": config.apiKey },
      schema,
      timeoutMs: TIMEOUT_MS,
      signal: ctx.signal,
    })
  )
}

/** The Overseerr user id whose `plexId` is the member's `plexUserId`, or `null`. */
export async function findOverseerrUser(
  config: OverseerrEndpoint,
  plexUserId: string,
  ctx: SourceContext
): Promise<SourceResult<number | null>> {
  const plexId = Number(plexUserId)
  if (!plexUserId.trim() || !Number.isSafeInteger(plexId)) return { ok: true, data: null }

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await get(config, `/user?take=${PAGE_SIZE}&skip=${page * PAGE_SIZE}`, overseerrUserPageSchema, ctx)
    if (!result.ok) return result
    const match = result.data.results.find((user) => user.plexId === plexId)
    if (match) return { ok: true, data: match.id }
    if (result.data.results.length === 0 || result.data.pageInfo.page >= result.data.pageInfo.pages) {
      return { ok: true, data: null }
    }
  }
  return { ok: false, code: "PAGE_LIMIT" }
}

/** Every request created inside `window`, optionally by one Overseerr user. @internal */
async function readRequests(
  config: OverseerrEndpoint,
  window: TimeWindow,
  requestedBy: number | null,
  ctx: SourceContext
): Promise<SourceResult<RequestEvent[]>> {
  const events = new Map<number, RequestEvent>()
  const tally: RowTally = { read: 0, dropped: 0 }
  const by = requestedBy === null ? "" : `&requestedBy=${requestedBy}`
  let skip = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    const path = `/request?take=${PAGE_SIZE}&skip=${skip}&sort=added&filter=all${by}`
    const result = await get(config, path, overseerrRequestPageSchema, ctx)
    if (!result.ok) return result

    const rows = parseRows("overseerr request", overseerrRequestSchema, result.data.results, tally)
    const pageEvents = rows.map(toRequestEvent)
    for (const event of pageEvents) if (inWindow(event.createdAt, window)) events.set(event.id, event)
    skip += result.data.results.length

    const reachedBack = pageEvents.some((event) => event.createdAt < window.start)
    const lastPage = result.data.results.length === 0 || result.data.pageInfo.page >= result.data.pageInfo.pages
    if (reachedBack || lastPage) {
      return tooManyInvalid(tally) ? { ok: false, code: "ROWS_INVALID" } : { ok: true, data: [...events.values()] }
    }
  }
  return { ok: false, code: "PAGE_LIMIT" }
}

async function genresFor(config: OverseerrEndpoint, event: RequestEvent, cache: GenreCache, ctx: SourceContext) {
  if (event.tmdbId === null) return []
  const cacheKey = `${event.mediaType}:${event.tmdbId}`
  const cached = cache.get(cacheKey)
  if (cached) return cached
  const detail = await get(config, `/${event.mediaType}/${event.tmdbId}`, overseerrMediaDetailSchema, ctx)
  const genres = detail.ok ? detail.data.genres.map((genre) => genre.name) : []
  cache.set(cacheKey, genres)
  return genres
}

/** The member's requests created inside `window`, with their genres. */
export async function fetchMemberRequests(
  config: OverseerrEndpoint,
  overseerrUserId: number,
  window: TimeWindow,
  genres: GenreCache,
  ctx: SourceContext
): Promise<SourceResult<RequestEvent[]>> {
  const result = await readRequests(config, window, overseerrUserId, ctx)
  if (!result.ok) return result
  for (const event of result.data) event.genres = await genresFor(config, event, genres, ctx)
  return result
}

/** Every request created inside `window`, without genres: P2.6's server-wide pass. */
export function fetchServerRequests(
  config: OverseerrEndpoint,
  window: TimeWindow,
  ctx: SourceContext
): Promise<SourceResult<RequestEvent[]>> {
  return readRequests(config, window, null, ctx)
}
