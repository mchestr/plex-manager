/**
 * Counts visits to a public Rewind link without keeping anything about the
 * visitor (design 6.2, GAP-37).
 *
 * ## Process
 *
 * 1. The day key is 32 random bytes held only in Redis at
 *    `rw:visitkey:<day>` for 48 hours, the day being the server zone's (so
 *    the share analytics chart buckets visits on the days it labels); the first visit of a day creates it
 *    (`SET NX`), so every process uses the same key and no key is stored.
 * 2. `SET rw:visit:<shareId>:<HMAC-SHA256(dayKey, ip)> 1 NX EX 86400` marks the
 *    visitor for the day. Only when that write succeeds is the visit new.
 * 3. A new visit upserts `RewindShareVisitDay { shareId, day }` and increments
 *    its `count`.
 *
 * The database never receives an IP, a hash of one, a user agent or a
 * referer, and the marks expire with the day key. P7.5's share page calls it.
 *
 * @module lib/wrapped/share/visit-counter
 */

import "server-only"

import { createHmac, randomBytes } from "node:crypto"

import type Redis from "ioredis"

import { prisma as defaultPrisma } from "@/lib/prisma"
import { getRequestPathRedis } from "@/lib/queue/connection"
import { serverZone } from "@/lib/utils/server-zone"
import { dayKey as zoneDayKey } from "@/lib/utils/zoned-time"

const DAY_KEY_TTL_S = 48 * 60 * 60
const VISIT_TTL_S = 24 * 60 * 60

interface VisitDayUpsert {
  where: { shareId_day: { shareId: string; day: Date } }
  create: { shareId: string; day: Date; count: number }
  update: { count: { increment: number } }
}

/** What the counter writes with: only the day's count, by share and day. */
interface VisitWriter {
  rewindShareVisitDay: { upsert(args: VisitDayUpsert): Promise<unknown> }
}

interface VisitDeps {
  redis: Pick<Redis, "set" | "getBuffer">
  prisma: VisitWriter
  now: Date
  /** The server zone, which decides the day. */
  zone: string
}

/** Today's key: the one in Redis, or a new one when this is the day's first visit. */
async function dayKey(redis: VisitDeps["redis"], day: string): Promise<Buffer> {
  const key = `rw:visitkey:${day}`
  await redis.set(key, randomBytes(32), "EX", DAY_KEY_TTL_S, "NX")
  const stored = await redis.getBuffer(key)
  if (!stored) throw new Error("The visit day key vanished")
  return stored
}

/**
 * Records one visit to `shareId` from `ip`: counted once per visitor per day in the server zone.
 * @public P7.5's share page calls it.
 *
 * @returns whether this visit was counted.
 */
export async function recordShareVisit(shareId: string, ip: string, deps: Partial<VisitDeps> = {}): Promise<boolean> {
  const redis = deps.redis ?? getRequestPathRedis()
  const prisma = deps.prisma ?? defaultPrisma
  const now = deps.now ?? new Date()
  const day = zoneDayKey(now.getTime(), deps.zone ?? (await serverZone()))

  const visitor = createHmac("sha256", await dayKey(redis, day)).update(ip).digest("hex")
  const fresh = await redis.set(`rw:visit:${shareId}:${visitor}`, "1", "EX", VISIT_TTL_S, "NX")
  if (fresh !== "OK") return false

  const date = new Date(`${day}T00:00:00Z`)
  await prisma.rewindShareVisitDay.upsert({
    where: { shareId_day: { shareId, day: date } },
    create: { shareId, day: date, count: 1 },
    update: { count: { increment: 1 } },
  })
  return true
}
