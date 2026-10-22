/**
 * Plex watchlist client: the member's watchlist from Plex's discover API, and
 * the external IDs of one item (GAP-02).
 *
 * ## Listing
 *
 * `GET https://discover.provider.plex.tv/library/sections/watchlist/all`,
 * paged with `X-Plex-Container-Start` and `X-Plex-Container-Size: 100` until
 * `start >= totalSize`, at most 20 pages. The first page sends the stored ETag
 * as `If-None-Match`; a 304 means nothing changed since the last complete read.
 * The listing carries no `Guid` array, so it gives no TMDB or TVDB IDs.
 *
 * ## External IDs
 *
 * `GET /library/metadata/{ratingKey}` returns the item with `Guid[]`
 * (`tmdb://603`, `tvdb://81189`, `imdb://tt0133093`), the second call every
 * reference client (Overseerr, Ombi, python-plexapi) makes.
 *
 * The discover API is undocumented. The contract tests replay recorded
 * responses (`__tests__/fixtures/`); re-record them if Plex changes the shape.
 *
 * @module lib/watchlist/plex-watchlist
 */

import { z } from "zod"

import { plexProduct } from "@/lib/brand"
import { serviceErrorMessage, serviceFetch } from "@/lib/connections/http"
import { getClientIdentifier } from "@/lib/connections/plex-core"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("PLEX_WATCHLIST")

const PLEX_DISCOVER_URL = "https://discover.provider.plex.tv"
const PAGE_SIZE = 100
const MAX_PAGES = 20

/** One watchlist entry. Only films and shows can be requested; collections are dropped. */
export interface WatchlistListing {
  ratingKey: string
  guid?: string
  type: "movie" | "show"
  title: string
  year?: number
}

export interface ExternalIds {
  tmdbId?: number
  tvdbId?: number
  imdbId?: string
}

const listingSchema = z.object({
  MediaContainer: z.looseObject({
    totalSize: z.number().int().nonnegative().optional(),
    Metadata: z
      .array(
        z.looseObject({
          ratingKey: z.string().min(1),
          guid: z.string().optional(),
          type: z.string(),
          title: z.string(),
          year: z.number().int().optional(),
        })
      )
      .optional(),
  }),
})

const metadataSchema = z.object({
  MediaContainer: z.looseObject({
    Metadata: z
      .array(z.looseObject({ Guid: z.array(z.looseObject({ id: z.string() })).optional() }))
      .optional(),
  }),
})

/** TMDB, TVDB and IMDb IDs from a `Guid[]` such as `[{ id: "tmdb://603" }]`. */
function parseExternalIds(guids: ReadonlyArray<{ id: string }> | undefined): ExternalIds {
  const result: ExternalIds = {}
  for (const { id } of guids ?? []) {
    const [scheme, value] = id.split("://")
    if (!value) continue
    if (scheme === "tmdb" && /^\d+$/.test(value)) result.tmdbId = Number(value)
    else if (scheme === "tvdb" && /^\d+$/.test(value)) result.tvdbId = Number(value)
    else if (scheme === "imdb") result.imdbId = value
  }
  return result
}

/** Standard Plex headers for a member's requests. */
function getPlexHeaders(userToken: string): Record<string, string> {
  return {
    Accept: "application/json",
    "X-Plex-Token": userToken,
    "X-Plex-Client-Identifier": getClientIdentifier(),
    "X-Plex-Product": plexProduct,
    "X-Plex-Version": "1.0.0",
    "X-Plex-Platform": "Web",
  }
}

export type GetWatchlistResult =
  | { success: true; notModified: true }
  | {
      success: true
      notModified: false
      data: WatchlistListing[]
      /** The first page's ETag, for the next run's `If-None-Match`. */
      etag: string | null
      /** False when the 20-page cap cut the read short. */
      complete: boolean
    }
  | { success: false; error: string }

/**
 * Read the member's whole watchlist, page by page (see the module docs).
 *
 * @param userToken The member's Plex auth token
 * @param options.etag The ETag of the last complete read; a 304 returns `{ notModified: true }`
 */
export async function getPlexWatchlist(
  userToken: string,
  { etag, signal }: { etag?: string | null; signal?: AbortSignal } = {}
): Promise<GetWatchlistResult> {
  const items: WatchlistListing[] = []
  let firstEtag: string | null = null

  for (let page = 0; page < MAX_PAGES; page++) {
    const start = page * PAGE_SIZE
    const result = await serviceFetch({
      service: "Plex",
      url: `${PLEX_DISCOVER_URL}/library/sections/watchlist/all?includeCollections=1&includeExternalMedia=1`,
      headers: {
        ...getPlexHeaders(userToken),
        "X-Plex-Container-Start": String(start),
        "X-Plex-Container-Size": String(PAGE_SIZE),
        ...(page === 0 && etag ? { "If-None-Match": etag } : {}),
      },
      schema: listingSchema,
      signal,
      onResponse: ({ headers }) => {
        if (page === 0) firstEtag = headers.get("etag")
      },
    })

    if (!result.ok) {
      if (page === 0 && result.code === "HTTP" && result.status === 304) return { success: true, notModified: true }
      if (result.code === "HTTP" && result.status === 401) {
        logger.warn("Plex watchlist fetch failed - unauthorized (token may be expired)")
        return { success: false, error: "Plex token is invalid or expired" }
      }
      return { success: false, error: `Could not read the watchlist: ${serviceErrorMessage("Plex", result)}` }
    }

    const { totalSize, Metadata = [] } = result.data.MediaContainer
    for (const item of Metadata) {
      if (item.type !== "movie" && item.type !== "show") continue
      items.push({ ratingKey: item.ratingKey, guid: item.guid, type: item.type, title: item.title, year: item.year })
    }

    const next = start + PAGE_SIZE
    const done = totalSize === undefined ? Metadata.length < PAGE_SIZE : next >= totalSize
    if (done || Metadata.length === 0) {
      logger.debug("Fetched watchlist items", { count: items.length, pages: page + 1 })
      return { success: true, notModified: false, data: items, etag: firstEtag, complete: true }
    }
  }

  logger.warn("Watchlist is longer than the page cap; the rest waits", { pages: MAX_PAGES, read: items.length })
  return { success: true, notModified: false, data: items, etag: firstEtag, complete: false }
}

/**
 * The TMDB, TVDB and IMDb IDs of one watchlist item, from its discover
 * metadata (10 s budget). An item Plex cannot match has none of them.
 */
export async function resolveExternalIds(
  ratingKey: string,
  userToken: string,
  { signal }: { signal?: AbortSignal } = {}
): Promise<{ ok: true; ids: ExternalIds } | { ok: false; error: string }> {
  const result = await serviceFetch({
    service: "Plex",
    url: `${PLEX_DISCOVER_URL}/library/metadata/${encodeURIComponent(ratingKey)}`,
    headers: getPlexHeaders(userToken),
    schema: metadataSchema,
    timeoutMs: 10_000,
    signal,
  })
  if (!result.ok) return { ok: false, error: serviceErrorMessage("Plex", result) }
  return { ok: true, ids: parseExternalIds(result.data.MediaContainer.Metadata?.[0]?.Guid) }
}

/**
 * Validate a user's Plex token is still valid
 * @param userToken User's Plex auth token
 */
export async function validatePlexToken(userToken: string): Promise<boolean> {
  try {
    const url = "https://plex.tv/api/v2/user"
    const response = await fetch(url, {
      method: "GET",
      headers: getPlexHeaders(userToken),
    })

    return response.ok
  } catch (error) {
    logger.debug("Error validating Plex token", { error })
    return false
  }
}
