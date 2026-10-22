/**
 * One pass over a member's watchlist: resolve each new item's external IDs
 * and file its Overseerr request (GAP-02, GAP-03).
 *
 * ## Per item
 *
 * 1. An item whose history row is terminal (`REQUESTED`, `ALREADY_AVAILABLE`,
 *    `ALREADY_REQUESTED`, `NOT_PERMITTED`) is left alone; `FAILED` and
 *    `SKIPPED_NO_EXTERNAL_ID` are tried again.
 * 2. Its TMDB and TVDB IDs come from the history row when it holds either,
 *    otherwise from `resolveExternalIds`, four lookups at a time.
 * 3. No TMDB id: a `SKIPPED_NO_EXTERNAL_ID` row. A failed lookup: `FAILED`.
 * 4. Otherwise `submitOverseerrRequest`, as the member's Overseerr user.
 *
 * A run files at most {@link MAX_REQUESTS_PER_RUN} new requests (SEC-27);
 * the rest are `deferred` and wait for the next run.
 *
 * @module lib/watchlist/sync-run
 */

import { submitOverseerrRequest, type SubmitOverseerrRequestResult } from "@/lib/connections/overseerr"
import { MediaType, WatchlistSyncStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import type { WatchlistCounts } from "./summary"
import { resolveExternalIds, type ExternalIds, type WatchlistListing } from "./plex-watchlist"

const logger = createLogger("WATCHLIST_SYNC")

const MAX_REQUESTS_PER_RUN = 50
const LOOKUP_CONCURRENCY = 4

const TERMINAL: ReadonlySet<WatchlistSyncStatus> = new Set([
  WatchlistSyncStatus.REQUESTED,
  WatchlistSyncStatus.ALREADY_AVAILABLE,
  WatchlistSyncStatus.ALREADY_REQUESTED,
  WatchlistSyncStatus.NOT_PERMITTED,
])

const STATUS_BY_RESULT: Record<SubmitOverseerrRequestResult["status"], WatchlistSyncStatus> = {
  created: WatchlistSyncStatus.REQUESTED,
  already_available: WatchlistSyncStatus.ALREADY_AVAILABLE,
  already_requested: WatchlistSyncStatus.ALREADY_REQUESTED,
  not_permitted: WatchlistSyncStatus.NOT_PERMITTED,
  failed: WatchlistSyncStatus.FAILED,
}

const COUNT_BY_STATUS: Partial<Record<WatchlistSyncStatus, keyof WatchlistCounts>> = {
  REQUESTED: "requested",
  ALREADY_AVAILABLE: "available",
  ALREADY_REQUESTED: "alreadyRequested",
  SKIPPED_NO_EXTERNAL_ID: "skipped",
  NOT_PERMITTED: "notPermitted",
}

export interface WatchlistRunCounts extends WatchlistCounts {
  /** History rows written this run. */
  synced: number
  failed: number
  /** Left for the next run by the request cap. */
  deferred: number
}

interface RunInput {
  userId: string
  userToken: string
  items: WatchlistListing[]
  overseerr: { url: string; apiKey: string }
  overseerrUserId: number
}

type Lookup = { ok: true; ids: ExternalIds } | { ok: false; error: string }

/** Process the items; see the module docs. */
export async function processWatchlistItems(input: RunInput): Promise<{ counts: WatchlistRunCounts; errors: string[] }> {
  const { userId, userToken, items } = input
  const history = await prisma.watchlistSyncHistory.findMany({
    where: { userId },
    select: { plexRatingKey: true, status: true, tmdbId: true, tvdbId: true, imdbId: true },
  })
  const known = new Map(history.map((row) => [row.plexRatingKey, row]))
  const candidates = items.filter((item) => {
    const status = known.get(item.ratingKey)?.status
    return !status || !TERMINAL.has(status)
  })

  const counts: WatchlistRunCounts = {
    requested: 0, available: 0, alreadyRequested: 0, skipped: 0, notPermitted: 0, synced: 0, failed: 0, deferred: 0,
  }
  const errors: string[] = []

  for (let i = 0; i < candidates.length; i += LOOKUP_CONCURRENCY) {
    if (counts.requested >= MAX_REQUESTS_PER_RUN) {
      counts.deferred = candidates.length - i
      break
    }
    const chunk = candidates.slice(i, i + LOOKUP_CONCURRENCY)
    const lookups = await Promise.all(
      chunk.map((item): Promise<Lookup> => {
        const row = known.get(item.ratingKey)
        if (row && (row.tmdbId !== null || row.tvdbId !== null)) {
          return Promise.resolve({
            ok: true,
            ids: { tmdbId: row.tmdbId ?? undefined, tvdbId: row.tvdbId ?? undefined, imdbId: row.imdbId ?? undefined },
          })
        }
        return resolveExternalIds(item.ratingKey, userToken)
      })
    )

    for (const [j, item] of chunk.entries()) {
      if (counts.requested >= MAX_REQUESTS_PER_RUN) {
        counts.deferred += 1
        continue
      }
      try {
        const outcome = await processItem(input, item, lookups[j])
        const key = COUNT_BY_STATUS[outcome.status]
        if (key) counts[key] += 1
        if (outcome.status === WatchlistSyncStatus.FAILED) counts.failed += 1
        if (outcome.message) errors.push(`${item.title}: ${outcome.message}`)
        counts.synced += 1
      } catch (error) {
        logger.error("Error processing watchlist item", error, { userId, ratingKey: item.ratingKey })
        counts.failed += 1
        errors.push(`${item.title}: Processing error`)
      }
    }
  }

  return { counts, errors }
}

/** Decide one item's status and write its history row. */
async function processItem(
  { userId, overseerr, overseerrUserId }: RunInput,
  item: WatchlistListing,
  lookup: Lookup
): Promise<{ status: WatchlistSyncStatus; message?: string }> {
  const ids = lookup.ok ? lookup.ids : {}
  let status: WatchlistSyncStatus
  let message: string | undefined
  let request: SubmitOverseerrRequestResult | undefined

  if (!lookup.ok) {
    status = WatchlistSyncStatus.FAILED
    message = lookup.error
  } else if (ids.tmdbId === undefined) {
    logger.debug("No TMDB id for watchlist item", { ratingKey: item.ratingKey })
    status = WatchlistSyncStatus.SKIPPED_NO_EXTERNAL_ID
  } else {
    const mediaType = item.type === "movie" ? "movie" : "tv"
    request = await submitOverseerrRequest(overseerr, { mediaType, mediaId: ids.tmdbId }, { overseerrUserId })
    status = STATUS_BY_RESULT[request.status]
    message = request.error
  }

  const requestedAt = status === WatchlistSyncStatus.REQUESTED ? new Date() : undefined
  const fields = {
    status,
    tmdbId: ids.tmdbId ?? null,
    tvdbId: ids.tvdbId ?? null,
    imdbId: ids.imdbId ?? null,
    requestedAt,
    overseerrRequestId: request?.requestId,
  }
  await prisma.watchlistSyncHistory.upsert({
    where: { userId_plexRatingKey: { userId, plexRatingKey: item.ratingKey } },
    create: {
      userId,
      plexRatingKey: item.ratingKey,
      guid: item.guid ?? `plex://${item.type}/${item.ratingKey}`,
      mediaType: item.type === "movie" ? MediaType.MOVIE : MediaType.TV_SERIES,
      title: item.title,
      year: item.year,
      ...fields,
    },
    // A failed lookup keeps whatever IDs an earlier run stored
    update: lookup.ok ? fields : { status, requestedAt },
  })
  return { status, message }
}
