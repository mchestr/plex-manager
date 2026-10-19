/**
 * `MediaMetadataCache`: one row per film and series, read by the stats engine
 * (design 7.5).
 *
 * ## Two writers
 *
 * 1. The library pass of each batch upserts every film and series from Plex
 *    (`upsertLibraryItems`): genres, directors, actors, guids, `addedAt`,
 *    year, content rating and section. Every title therefore has its rating
 *    before any member is generated, not only those the warm job covers.
 *    A row it creates is dated {@link NEVER_WARMED}.
 * 2. `REWIND_METADATA_WARM` adds what only Tautulli's `get_metadata` knows
 *    (runtime, resolution, HDR, season episode counts) and sets `fetchedAt`.
 *
 * ## Reads
 *
 * `getMetadata` reads with one `findMany`; an episode resolves to its series.
 * A miss is simply absent, and the page that needs it omits itself, so a miss
 * never blocks generation. A warmed row older than 30 days is still served,
 * and also queued for a refresh.
 *
 * @module lib/wrapped/metadata-cache
 */

import "server-only"

import { createHash } from "node:crypto"

import type { MediaMetadataCache, Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { enqueueMetadataWarm } from "@/lib/queue/rewind-batch-queue"
import { createLogger } from "@/lib/utils/logger"
import { metadataKeyOf } from "@/lib/wrapped/aggregate/rating-exclusions"
import type { LibraryItem } from "@/lib/wrapped/sources/plex-library"
import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"

const logger = createLogger("REWIND_METADATA")

/** `fetchedAt` of a row only the library pass has written. @internal Exported for tests. */
export const NEVER_WARMED = new Date(0)

/** A warmed row this old is refreshed; anything younger is fresh. */
const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000

const UPSERT_CHUNK = 200

/** The warm job's batch size. */
export const WARM_BATCH_SIZE = 200

/** @public P2.8 */
export type MediaMetadata = MediaMetadataCache

const isStale = (row: Pick<MediaMetadata, "fetchedAt">, now: number) =>
  row.fetchedAt.getTime() > NEVER_WARMED.getTime() && row.fetchedAt.getTime() < now - STALE_AFTER_MS

/** Queues a warm job for stale keys; a failure is logged and never reaches the reader. */
async function queueRefresh(keys: string[]): Promise<void> {
  const sorted = [...keys].sort().slice(0, WARM_BATCH_SIZE)
  const hash = createHash("sha256").update(sorted.join(",")).digest("hex").slice(0, 16)
  try {
    await enqueueMetadataWarm({ batch: `refresh:${hash}`, keys: sorted, topSeries: [] })
  } catch (error) {
    logger.warn("Could not queue a metadata refresh", { keys: sorted.length, error: String(error) })
  }
}

/**
 * Metadata for each play's title, by the play's `ratingKey`: an episode gets
 * its series' row. Titles the cache does not hold are absent.
 *
 * @example
 * ```ts
 * const metadata = await getMetadata(events)
 * metadata.get(episode.ratingKey)?.genres // the series' genres, or undefined on a miss
 * ```
 *
 * @public P2.8 and P5.9 read it.
 */
export async function getMetadata(
  refs: readonly Pick<PlayEvent, "ratingKey" | "grandparentRatingKey">[],
  { now = Date.now(), refresh = queueRefresh }: { now?: number; refresh?: (keys: string[]) => Promise<void> } = {}
): Promise<Map<string, MediaMetadata>> {
  const keys = [...new Set(refs.map(metadataKeyOf))]
  const rows = keys.length === 0 ? [] : await prisma.mediaMetadataCache.findMany({ where: { ratingKey: { in: keys } } })
  const byKey = new Map(rows.map((row) => [row.ratingKey, row]))

  const stale = rows.filter((row) => isStale(row, now)).map((row) => row.ratingKey)
  // Not awaited: a slow or failing enqueue must not hold up the reader
  if (stale.length > 0) void refresh(stale)

  const result = new Map<string, MediaMetadata>()
  for (const ref of refs) {
    const row = byKey.get(metadataKeyOf(ref))
    if (row) result.set(ref.ratingKey, row)
  }
  return result
}

/** Content ratings by cache key; a key the cache does not hold is absent. */
export async function getContentRatings(keys: readonly string[]): Promise<Map<string, string | null>> {
  if (keys.length === 0) return new Map()
  const rows = await prisma.mediaMetadataCache.findMany({
    where: { ratingKey: { in: [...new Set(keys)] } },
    select: { ratingKey: true, contentRating: true },
  })
  return new Map(rows.map((row) => [row.ratingKey, row.contentRating]))
}

/** The keys among `keys` whose rows were warmed within the last 30 days. */
export async function freshKeys(keys: readonly string[], now = Date.now()): Promise<Set<string>> {
  if (keys.length === 0) return new Set()
  const rows = await prisma.mediaMetadataCache.findMany({
    where: { ratingKey: { in: [...keys] }, fetchedAt: { gte: new Date(now - STALE_AFTER_MS) } },
    select: { ratingKey: true },
  })
  return new Set(rows.map((row) => row.ratingKey))
}

function libraryFields(item: LibraryItem) {
  return {
    kind: item.type === "show" ? "series" : "film",
    librarySectionId: item.librarySectionId,
    addedAt: item.addedAt === null ? null : new Date(item.addedAt),
    genres: item.genres,
    directors: item.directors,
    actors: item.actors,
    guids: item.guids,
    year: item.year,
    contentRating: item.contentRating,
  } satisfies Prisma.MediaMetadataCacheUpdateInput
}

/**
 * Upserts the films and series of the library pass. Rows the warm job filled
 * keep their runtime, resolution and `fetchedAt`.
 *
 * @returns the number of rows written
 */
export async function upsertLibraryItems(items: readonly LibraryItem[]): Promise<number> {
  const titles = items.filter((item) => item.type === "movie" || item.type === "show")
  for (let i = 0; i < titles.length; i += UPSERT_CHUNK) {
    await prisma.$transaction(
      titles.slice(i, i + UPSERT_CHUNK).map((item) => {
        const fields = libraryFields(item)
        return prisma.mediaMetadataCache.upsert({
          where: { ratingKey: item.ratingKey },
          create: { ratingKey: item.ratingKey, ...fields, fetchedAt: NEVER_WARMED },
          // A rating Plex no longer reports keeps the one the warm stored
          update: { ...fields, contentRating: fields.contentRating ?? undefined },
          select: { ratingKey: true },
        })
      })
    )
  }
  return titles.length
}
