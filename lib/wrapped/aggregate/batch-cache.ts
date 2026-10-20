/**
 * The per-batch event cache (design 7.4): each member's plays from the
 * server-wide pass, so generation reads Tautulli once per batch rather than
 * once per member.
 *
 * - `rw:batch:{year}:{through}:events:{userId}`: the member's plays for the
 *   batch window in their zone, gzipped JSON, kept 24 hours.
 * - `rw:batch:{year}:{through}:lifetime:{userId}`: their lifetime plays,
 *   cached the first time they are read.
 *
 * {@link getMemberEvents} serves the entry, or falls back to `fetchYear()`
 * when it is missing, unreadable, built for another window, or Redis is down.
 * Either way it then applies the content-rating exclusions (FR-44).
 *
 * @module lib/wrapped/aggregate/batch-cache
 */

import "server-only"

import { promisify } from "node:util"
import { gunzip, gzip } from "node:zlib"

import type Redis from "ioredis"
import { z } from "zod"

import { getRequestPathRedis, readyWithin } from "@/lib/queue/connection"
import { createLogger } from "@/lib/utils/logger"
import { getContentRatings } from "@/lib/wrapped/metadata-cache"
import type { LibraryTitle } from "@/lib/wrapped/stats/next-year"
import type { TautulliHistorySource } from "@/lib/wrapped/sources/tautulli-history"
import type { PlayEvent, SourceContext, SourceResult } from "@/lib/wrapped/sources/watch-history-source"
import type { TimeWindow } from "@/lib/wrapped/time/zone"

import { applyRatingExclusions, metadataKeyOf } from "./rating-exclusions"

const logger = createLogger("REWIND_BATCH_CACHE")

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

/** How long a batch's entries live. */
const BATCH_TTL_SECONDS = 24 * 60 * 60

const READY_WAIT_MS = 2000

/** The commands the cache uses. */
export type BatchCacheRedis = Pick<Redis, "getBuffer" | "set">

const events = z.array(z.custom<PlayEvent>((v) => typeof v === "object" && v !== null))
const yearEntrySchema = z.object({ start: z.number(), end: z.number(), events })
const lifetimeEntrySchema = z.object({ events })
const libraryEntrySchema = z.object({
  titles: z.array(z.custom<LibraryTitle>((v) => typeof v === "object" && v !== null)),
})

/** The member an entry belongs to. @public P5.9 */
export interface BatchMember {
  userId: string
  plexUserId: string
}

interface BatchKey {
  year: number
  through: string
}

const entryKey = (batch: BatchKey, kind: "events" | "lifetime", userId: string) =>
  `rw:batch:${batch.year}:${batch.through}:${kind}:${userId}`

const libraryKey = (batch: BatchKey) => `rw:batch:${batch.year}:${batch.through}:library`

/** The fail-fast request-path client, once it is ready (or after 2 s). */
export async function batchCacheRedis(): Promise<BatchCacheRedis> {
  const redis = getRequestPathRedis()
  await readyWithin(redis, READY_WAIT_MS)
  return redis
}

async function write(redis: BatchCacheRedis, key: string, value: unknown): Promise<void> {
  await redis.set(key, await gzipAsync(JSON.stringify(value)), "EX", BATCH_TTL_SECONDS)
}

/** The parsed entry, or null when it is missing or unreadable (logged). */
async function read<T>(redis: BatchCacheRedis, key: string, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const raw = await redis.getBuffer(key)
    if (!raw) return null
    const parsed = schema.safeParse(JSON.parse((await gunzipAsync(raw)).toString("utf8")))
    if (parsed.success) return parsed.data
    logger.warn("Unreadable batch cache entry", { key })
  } catch (error) {
    logger.warn("Batch cache read failed", { key, error: String(error) })
  }
  return null
}

/** Stores a member's plays from the server-wide pass for the batch. */
export async function storeMemberEvents(
  redis: BatchCacheRedis,
  batch: BatchKey & { userId: string; window: TimeWindow; events: readonly PlayEvent[] }
): Promise<void> {
  const { window } = batch
  await write(redis, entryKey(batch, "events", batch.userId), { start: window.start, end: window.end, events: batch.events })
}

/** @public P5.9 */
export interface MemberEventsRequest extends BatchKey {
  member: BatchMember
  /** The member's window for the batch, in their Rewind zone. */
  window: TimeWindow
  source: Pick<TautulliHistorySource, "fetchYear">
  /** `Config.rewindExcludedContentRatings`, parsed with `excludedContentRatingsSchema`. */
  excludedContentRatings: readonly string[]
  redis?: BatchCacheRedis
}

/**
 * The member's plays for the batch window, from the batch cache or a
 * per-member `fetchYear()`, with each play's content rating filled and the
 * rating exclusions applied.
 *
 * @example
 * ```ts
 * const plays = await getMemberEvents({ member, year: 2026, through: "2026-11-30", window, source, excludedContentRatings }, ctx)
 * if (plays.ok) listableEvents(plays.data) // what lists may show; totals use every play
 * ```
 *
 * @public P5.9 reads every member through it.
 */
export async function getMemberEvents(request: MemberEventsRequest, ctx: SourceContext): Promise<SourceResult<PlayEvent[]>> {
  const { member, window } = request
  const redis = request.redis ?? (await batchCacheRedis())
  const cached = await read(redis, entryKey(request, "events", member.userId), yearEntrySchema)
  const usable = cached && cached.start === window.start && cached.end === window.end ? cached.events : null

  let plays: PlayEvent[]
  if (usable) plays = usable
  else {
    const fetched = await request.source.fetchYear({ plexUserId: member.plexUserId }, window, ctx)
    if (!fetched.ok) return fetched
    plays = fetched.data
  }

  const ratings = await getContentRatings(plays.map(metadataKeyOf))
  return { ok: true, data: applyRatingExclusions(plays, ratings, request.excludedContentRatings) }
}

/**
 * The member's lifetime plays (`member.since` and the 2025 comparison only),
 * read through the batch cache: fetched once per batch, then served.
 *
 * @public P5.9
 */
export async function getMemberLifetimeEvents(
  request: BatchKey & { member: BatchMember; source: Pick<TautulliHistorySource, "fetchLifetime">; redis?: BatchCacheRedis },
  ctx: SourceContext
): Promise<SourceResult<PlayEvent[]>> {
  const { member } = request
  const redis = request.redis ?? (await batchCacheRedis())
  const key = entryKey(request, "lifetime", member.userId)
  const cached = await read(redis, key, lifetimeEntrySchema)
  if (cached) return { ok: true, data: cached.events }

  const fetched = await request.source.fetchLifetime({ plexUserId: member.plexUserId }, ctx)
  if (fetched.ok) {
    await write(redis, key, { events: fetched.data }).catch((error: unknown) =>
      logger.warn("Batch cache write failed", { key, error: String(error) })
    )
  }
  return fetched
}

/**
 * Stores the batch's library listing (films and series, with the fields
 * next year's picks read), so no member's Rewind lists the Plex library again.
 */
export async function storeBatchLibrary(
  redis: BatchCacheRedis,
  batch: BatchKey & { titles: readonly LibraryTitle[] }
): Promise<void> {
  const titles = batch.titles.map(({ ratingKey, type, title, year, addedAt, contentRating, genres, directors, actors }) => ({
    ratingKey, type, title, year, addedAt, contentRating, genres, directors, actors,
  }))
  await write(redis, libraryKey(batch), { titles })
}

/**
 * The batch's library listing, or null before the aggregate pass has run
 * (next year's picks then omit themselves, NFR-3).
 *
 * @public P5.9
 */
export async function getBatchLibrary(batch: BatchKey & { redis?: BatchCacheRedis }): Promise<LibraryTitle[] | null> {
  const redis = batch.redis ?? (await batchCacheRedis())
  return (await read(redis, libraryKey(batch), libraryEntrySchema))?.titles ?? null
}
