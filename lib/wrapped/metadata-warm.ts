/**
 * Fills `MediaMetadataCache` from Tautulli's `get_metadata` for the titles
 * `REWIND_METADATA_WARM` was given (design 7.5).
 *
 * - At most 4 titles at a time from this job, and every call also goes
 *   through `ctx.limiter` (the server-wide Tautulli semaphore).
 * - Each call has 10 s and one attempt; a failed or timed-out call is
 *   counted and its title skipped, never fatal.
 * - For the members' top series, `get_children_metadata` adds the episode
 *   count of each season.
 *
 * @module lib/wrapped/metadata-warm
 */

import "server-only"

import type { z } from "zod"

import { tautulliCommand } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { tautulliChildrenSchema, tautulliMetadataSchema, type TautulliMetadata } from "@/lib/wrapped/sources/schemas"
import { runLimited, type SourceContext } from "@/lib/wrapped/sources/watch-history-source"

/** Titles fetched at once by one job. @internal Exported for tests. */
export const WARM_CONCURRENCY = 4

const CALL_TIMEOUT_MS = 10_000

export interface WarmResult {
  fetched: number
  /** Calls that failed or timed out, season calls included. */
  failedCalls: number
}

interface WarmContext extends SourceContext {
  config: { url: string; apiKey: string }
}

/** Runs `fn` over `items` with at most `limit` in flight. @internal */
async function forEachLimited<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const lane = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
}

function call<T>(
  ctx: WarmContext,
  cmd: "get_metadata" | "get_children_metadata",
  params: Record<string, string>,
  schema: z.ZodType<T>
) {
  return runLimited(ctx, "tautulli", () =>
    tautulliCommand(ctx.config, cmd, params, schema, { timeoutMs: CALL_TIMEOUT_MS, attempts: 1, signal: ctx.signal })
  )
}

/** Episodes per season (`{ "1": 10, "2": 8 }`), or null when any call failed. */
async function seasonEpisodeCounts(ratingKey: string, ctx: WarmContext, onFail: () => void) {
  const seasons = await call(ctx, "get_children_metadata", { rating_key: ratingKey, media_type: "show" }, tautulliChildrenSchema)
  if (!seasons.ok) {
    onFail()
    return null
  }
  const counts: Record<string, number> = {}
  for (const season of seasons.data.children_list) {
    const params = { rating_key: season.rating_key, media_type: "season" }
    const episodes = await call(ctx, "get_children_metadata", params, tautulliChildrenSchema)
    if (!episodes.ok) {
      onFail()
      return null
    }
    counts[String(season.media_index ?? 0)] = episodes.data.children_count
  }
  return counts
}

const dateOrNull = (value: string | null) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value) : null)

function cacheFields(m: TautulliMetadata) {
  const video = m.media_info[0]
  return {
    kind: m.media_type === "show" ? "series" : "film",
    librarySectionId: m.section_id ?? "",
    addedAt: m.added_at === null ? null : new Date(m.added_at * 1000),
    genres: m.genres,
    directors: m.directors,
    actors: m.actors.slice(0, 10),
    studio: m.studio,
    contentRating: m.content_rating,
    year: m.year,
    originallyAvailableAt: dateOrNull(m.originally_available_at),
    runtimeSec: m.duration ? Math.round(m.duration / 1000) : null,
    guids: m.guids,
    videoResolution: video?.video_full_resolution ?? null,
    hdr: video ? (video.video_dynamic_range ?? "SDR") !== "SDR" : null,
  }
}

/**
 * Fetches and stores the metadata of `keys`, with season episode counts for
 * those also in `topSeries`.
 *
 * @example
 * ```ts
 * const result = await warmTitles({ keys: ["900", "500"], topSeries: ["500"] }, { config, limiter: redisLimiter, signal })
 * // { fetched: 2, failedCalls: 0 }
 * ```
 */
export async function warmTitles(
  { keys, topSeries }: { keys: readonly string[]; topSeries: readonly string[] },
  ctx: WarmContext
): Promise<WarmResult> {
  const series = new Set(topSeries)
  const result: WarmResult = { fetched: 0, failedCalls: 0 }
  const onFail = () => {
    result.failedCalls++
  }

  await forEachLimited(keys, WARM_CONCURRENCY, async (ratingKey) => {
    if (ctx.signal?.aborted) return
    const metadata = await call(ctx, "get_metadata", { rating_key: ratingKey }, tautulliMetadataSchema)
    if (!metadata.ok) {
      onFail()
      return
    }
    const seasonCounts = series.has(ratingKey) ? await seasonEpisodeCounts(ratingKey, ctx, onFail) : undefined
    const fields = { ...cacheFields(metadata.data), ...(seasonCounts ? { seasonEpisodeCounts: seasonCounts } : {}) }
    await prisma.mediaMetadataCache.upsert({
      where: { ratingKey },
      create: { ratingKey, ...fields, fetchedAt: new Date() },
      update: { ...fields, fetchedAt: new Date() },
      select: { ratingKey: true },
    })
    result.fetched++
  })
  return result
}
