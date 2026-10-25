/**
 * A member's year in numbers for `/mystats` and the linked-role hours, read
 * without scanning their whole Tautulli history (P11.12, RWP-17):
 *
 * ```
 * completed v3 Rewind for the year? ── yes ─► its facts (no Tautulli call)
 *     │ no
 * no Plex account ──────────────────────────► NO_PLEX_ACCOUNT
 * cached in Redis (15 min) ─────────────────► the cached stats
 * no active Tautulli ───────────────────────► NO_TAUTULLI
 * get_history over the year in the member's zone (padded after/before,
 * at most 20 pages, through the Tautulli semaphore)
 *     ├─ fails ─────────────────────────────► UNAVAILABLE (logged with its code)
 *     └─ ok ────────────────────────────────► totals, time and calendar, cached
 * ```
 *
 * @module lib/discord/stats/member-stats
 */

import "server-only"

import type Redis from "ioredis"

import { prisma } from "@/lib/prisma"
import { getRequestPathRedis, isRedisConfigured, readyWithin } from "@/lib/queue/connection"
import { redisLimiter } from "@/lib/queue/redis-semaphore"
import { createLogger } from "@/lib/utils/logger"
import { serverZone } from "@/lib/utils/server-zone"
import { zonedParts } from "@/lib/utils/zoned-time"
import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import { excludedSectionIdsSchema } from "@/lib/wrapped/sources/schemas"
import { createTautulliHistorySource } from "@/lib/wrapped/sources/tautulli-history"
import { directLimiter, type UpstreamLimiter } from "@/lib/wrapped/sources/watch-history-source"
import { resolveZone, yearWindow } from "@/lib/wrapped/time/zone"

import { memberYearStatsSchema, statsFromEvents, statsFromFacts, type MemberYearStats } from "./year-stats"
import { getActiveService } from "@/lib/data/active-service"

const logger = createLogger("DISCORD_MEMBER_STATS")

/** The most `get_history` pages one read takes (1,000 rows each). @internal */
export const MAX_HISTORY_PAGES = 20
const CACHE_TTL_SEC = 15 * 60
const READY_WAIT_MS = 2000

export type MemberYearStatsResult =
  | { ok: true; stats: MemberYearStats }
  | { ok: false; code: "NO_PLEX_ACCOUNT" | "NO_TAUTULLI" | "UNAVAILABLE" }

export interface MemberYearStatsOptions {
  year: number
  zone: string
  /** Admits each Tautulli page; defaults to the Redis semaphore when Redis is configured. */
  limiter?: UpstreamLimiter
  signal?: AbortSignal
}

/**
 * The member's current year and the zone it is taken in: `User.timezone`,
 * else the server zone, so 16:30 on 31 December in Los Angeles is still that
 * year (GAP-44).
 */
export async function memberStatsYear(timezone: string | null, now: number = Date.now()): Promise<{ year: number; zone: string }> {
  const { zone } = resolveZone({ timezone }, await serverZone())
  return { year: zonedParts(now, zone).year, zone }
}

/** @internal */
export function statsCacheKey(userId: string, year: number, zone: string): string {
  return `discord:stats:${userId}:${year}:${zone}`
}

async function cacheClient(): Promise<Redis | null> {
  if (!isRedisConfigured()) return null
  const redis = getRequestPathRedis()
  return (await readyWithin(redis, READY_WAIT_MS)) ? redis : null
}

async function readCached(redis: Redis | null, key: string): Promise<MemberYearStats | null> {
  if (!redis) return null
  try {
    const raw = await redis.get(key)
    const parsed = raw === null ? null : memberYearStatsSchema.safeParse(JSON.parse(raw))
    return parsed?.success ? parsed.data : null
  } catch {
    return null
  }
}

async function readHistory(
  userId: string,
  plexUserId: string,
  hiddenKeys: ReadonlySet<string>,
  { year, zone, limiter, signal }: MemberYearStatsOptions
): Promise<MemberYearStatsResult> {
  const [tautulli, config] = await Promise.all([
    getActiveService("tautulli"),
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindExcludedSectionIds: true } }),
  ])
  if (!tautulli) return { ok: false, code: "NO_TAUTULLI" }

  const source = createTautulliHistorySource({
    config: tautulli,
    excludedSectionIds: excludedSectionIdsSchema.parse(config?.rewindExcludedSectionIds ?? null),
    maxPages: MAX_HISTORY_PAGES,
  })
  const window = yearWindow(year, zone)
  const plays = await source.fetchYear({ plexUserId }, window, {
    limiter: limiter ?? (isRedisConfigured() ? redisLimiter : directLimiter),
    signal,
  })
  if (!plays.ok) {
    logger.warn("Could not read the member's history for their stats", { userId, code: plays.code })
    return { ok: false, code: "UNAVAILABLE" }
  }
  return { ok: true, stats: statsFromEvents(year, plays.data, { zone, window, finalCut: true, hiddenKeys }) }
}

/**
 * The member's stats for `year`: the stored v3 Rewind's facts when one is
 * completed, else a bounded read of their history (see the module JSDoc).
 * Never throws for an upstream failure.
 */
export async function getMemberYearStats(userId: string, options: MemberYearStatsOptions): Promise<MemberYearStatsResult> {
  const { year, zone } = options
  const [user, wrapped] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { plexUserId: true, rewindExclusions: { select: { ratingKey: true } } },
    }),
    prisma.plexWrapped.findUnique({ where: { userId_year: { userId, year } }, select: { status: true, data: true } }),
  ])

  if (wrapped?.status === "completed") {
    const stored = parseStoredRewind(wrapped.data)
    if (stored.version === 3) return { ok: true, stats: statsFromFacts(year, stored.data.facts) }
  }
  if (!user?.plexUserId) return { ok: false, code: "NO_PLEX_ACCOUNT" }

  const redis = await cacheClient()
  const key = statsCacheKey(userId, year, zone)
  const cached = await readCached(redis, key)
  if (cached) return { ok: true, stats: cached }

  const hiddenKeys = new Set(user.rewindExclusions.map((e) => e.ratingKey))
  const result = await readHistory(userId, user.plexUserId, hiddenKeys, options)
  if (result.ok && redis) {
    await redis.set(key, JSON.stringify(result.stats), "EX", CACHE_TTL_SEC).catch(() => undefined)
  }
  return result
}
