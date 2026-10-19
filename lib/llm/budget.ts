/**
 * Daily spend caps for the assistant (SEC-23).
 *
 * ## Overview
 *
 * Before every assistant LLM call, {@link checkSpend} compares what was spent
 * today with the caps on `Config`:
 *
 * - the caller's own spend against `llmDailyCapPerUserUsd` for a member, or
 *   `llmDailyCapAdminUsd` for an admin;
 * - the whole server's spend against `llmDailyCapServerUsd`.
 *
 * "Today" is the calendar day in the server zone (`serverZone()`), so the caps
 * reset at midnight server time. Only assistant calls count: rows that carry a
 * `chatConversationId`, which both the admin assistant and the Discord
 * assistant always set. Rewind spend falls under its own season budget.
 *
 * ## Cache
 *
 * Each sum is `prisma.lLMUsage.aggregate` over the `userId` and `createdAt`
 * indexes, cached in Redis for 60 seconds under `llm:spend:<day>:<userId>` and
 * `llm:spend:<day>:server`. {@link addSpend}, called by `recordUsage`, adds
 * each call's cost to a cached sum that exists, so a tool loop sees its own
 * spend at once instead of a minute later. Without `REDIS_URL`, or while Redis
 * is down, every check reads the database.
 *
 * ## Special cases
 *
 * - The check fails closed: when the caps or the sums cannot be read, the call
 *   is refused (`scope: "unavailable"`).
 * - A cap of 0 refuses every assistant call for that tier.
 *
 * @module lib/llm/budget
 */

import "server-only"

import type Redis from "ioredis"

import { prisma } from "@/lib/prisma"
import { getRequestPathRedis, isRedisConfigured } from "@/lib/queue/connection"
import { createLogger } from "@/lib/utils/logger"
import { serverZone } from "@/lib/utils/server-zone"
import { dayKey, wallTimeToInstant } from "@/lib/utils/zoned-time"

const logger = createLogger("LLM_BUDGET")

/** The reply when a cap is reached. */
export const ASSISTANT_BUDGET_MESSAGE = "I've hit today's assistant budget. It resets at midnight server time."

/** The reply when the check itself fails, so the call is refused. */
export const ASSISTANT_BUDGET_UNAVAILABLE_MESSAGE =
  "I can't check today's assistant budget right now, so I can't answer. Please try again in a few minutes."

/** The caps a missing `Config` row stands for: the column defaults. */
const DEFAULT_CAPS = { llmDailyCapPerUserUsd: 0.5, llmDailyCapAdminUsd: 5, llmDailyCapServerUsd: 5 }

const CACHE_TTL_SEC = 60

/** Assistant calls only: both assistant paths always attach a conversation. */
const ASSISTANT_ROWS = { chatConversationId: { not: null } }

/** Adds to a cached sum only when one is cached; a missing key is read from the database next time. */
const INCREMENT_IF_CACHED = `if redis.call("EXISTS", KEYS[1]) == 1 then return redis.call("INCRBYFLOAT", KEYS[1], ARGV[1]) end return false`

export type SpendCheck = { ok: true } | { ok: false; scope: "user" | "server" | "unavailable" }

/** The server-zone day of `now`: its `YYYY-MM-DD` key and the instant it started. */
async function spendDay(now: Date): Promise<{ key: string; start: Date }> {
  const zone = await serverZone()
  const key = dayKey(now.getTime(), zone)
  return { key, start: wallTimeToInstant(`${key}T00:00`, zone) }
}

/**
 * The cache key of one sum. `subject` is a user id or `server`.
 *
 * @internal
 */
export function spendCacheKey(day: string, subject: string): string {
  return `llm:spend:${day}:${subject}`
}

function cacheClient(): Redis | null {
  return isRedisConfigured() ? getRequestPathRedis() : null
}

/** A cached sum, or null when none is cached or Redis cannot answer. */
async function readCached(redis: Redis | null, key: string): Promise<number | null> {
  if (!redis) return null
  try {
    const value = await redis.get(key)
    const sum = value === null ? NaN : Number(value)
    return Number.isFinite(sum) ? sum : null
  } catch (error) {
    logger.debug("Spend cache read failed, reading the database", { error: String(error) })
    return null
  }
}

async function spentSince(redis: Redis | null, key: string, start: Date, userId?: string): Promise<number> {
  const cached = await readCached(redis, key)
  if (cached !== null) return cached

  const { _sum } = await prisma.lLMUsage.aggregate({
    _sum: { cost: true },
    where: { ...ASSISTANT_ROWS, ...(userId && { userId }), createdAt: { gte: start } },
  })
  const sum = _sum.cost ?? 0
  if (redis) {
    // NX: a sum another process cached, and has since added to, is kept
    await redis.set(key, String(sum), "EX", CACHE_TTL_SEC, "NX").catch(() => undefined)
  }
  return sum
}

/**
 * Whether the next assistant call fits today's caps. Never throws: an error
 * refuses the call.
 */
export async function checkSpend(
  { userId, isAdmin }: { userId: string; isAdmin: boolean },
  now: Date = new Date()
): Promise<SpendCheck> {
  try {
    const [config, day] = await Promise.all([
      prisma.config.findUnique({
        where: { id: "config" },
        select: { llmDailyCapPerUserUsd: true, llmDailyCapAdminUsd: true, llmDailyCapServerUsd: true },
      }),
      spendDay(now),
    ])
    const caps = config ?? DEFAULT_CAPS
    const redis = cacheClient()
    const [userSpent, serverSpent] = await Promise.all([
      spentSince(redis, spendCacheKey(day.key, userId), day.start, userId),
      spentSince(redis, spendCacheKey(day.key, "server"), day.start),
    ])

    const userCap = isAdmin ? caps.llmDailyCapAdminUsd : caps.llmDailyCapPerUserUsd
    if (userSpent >= userCap) return { ok: false, scope: "user" }
    if (serverSpent >= caps.llmDailyCapServerUsd) return { ok: false, scope: "server" }
    return { ok: true }
  } catch (error) {
    logger.error("Assistant spend check failed, refusing the call", error, { userId })
    return { ok: false, scope: "unavailable" }
  }
}

/**
 * Adds one assistant call's cost to today's cached sums for the user and the
 * server. Never throws: a sum that misses an increment is read again from the
 * database within a minute.
 */
export async function addSpend(userId: string, cost: number, now: Date = new Date()): Promise<void> {
  const redis = cacheClient()
  if (!redis || !(cost > 0)) return
  try {
    const { key } = await spendDay(now)
    await Promise.all(
      [spendCacheKey(key, userId), spendCacheKey(key, "server")].map((cacheKey) =>
        redis.eval(INCREMENT_IF_CACHED, 1, cacheKey, String(cost))
      )
    )
  } catch (error) {
    logger.debug("Spend cache increment failed", { error: String(error) })
  }
}
