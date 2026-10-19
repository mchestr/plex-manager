/**
 * The per-member Rewind generation lock (design 9.1).
 *
 * BullMQ deduplication covers member and admin requests, but fan-out children
 * carry no deduplication id, so every generation path also takes this lock:
 *
 * ```
 * SET rw:lock:gen:{year}:{userId} <owner> NX PX 600000   take it, or skip the run
 * every minute: PEXPIRE, only while the value is still <owner>
 * finally:      DEL, only while the value is still <owner>
 * ```
 *
 * The compare-and-renew and compare-and-delete scripts mean a run whose lock
 * expired can never extend or release the lock a newer run now holds.
 *
 * @module
 */

import type Redis from "ioredis"

import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("REDIS_LOCK")

const LOCK_TTL_MS = 600_000
const RENEW_EVERY_MS = 60_000

const RENEW_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0`

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`

export interface GenerationLock {
  /** Stops the renewal and deletes the lock if this owner still holds it; true when it did. */
  release(): Promise<boolean>
}

/**
 * Takes `rw:lock:gen:{year}:{userId}` for `owner` (the BullMQ job id) and
 * renews it every minute until released. Returns null when another owner holds
 * it, in which case the caller ends its run as `skipped`.
 *
 * @example
 * ```ts
 * const lock = await acquireGenerationLock(redis, { year: 2026, userId, owner: job.id })
 * if (!lock) return { status: "skipped", reason: "LOCKED" }
 * try {
 *   await generate()
 * } finally {
 *   await lock.release()
 * }
 * ```
 */
export async function acquireGenerationLock(
  redis: Redis,
  { year, userId, owner }: { year: number; userId: string; owner: string }
): Promise<GenerationLock | null> {
  const key = `rw:lock:gen:${year}:${userId}`
  const taken = await redis.set(key, owner, "PX", LOCK_TTL_MS, "NX")
  if (taken !== "OK") return null

  const renewal = setInterval(() => {
    redis.eval(RENEW_SCRIPT, 1, key, owner, LOCK_TTL_MS).then(
      (renewed) => {
        if (renewed !== 1) logger.warn("Generation lock lost before renewal", { key })
      },
      (error: unknown) => logger.warn("Generation lock renewal failed", { key, error: String(error) })
    )
  }, RENEW_EVERY_MS)
  renewal.unref()

  return {
    async release() {
      clearInterval(renewal)
      return (await redis.eval(RELEASE_SCRIPT, 1, key, owner)) === 1
    },
  }
}
