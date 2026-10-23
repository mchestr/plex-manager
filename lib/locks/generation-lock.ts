/**
 * The per-member Rewind generation lock (design 9.1), a {@link LeaseLock}
 * named `rw:lock:gen:{year}:{userId}` on the {@link RedisLeaseStore}.
 *
 * BullMQ deduplication covers member and admin requests, but fan-out children
 * carry no deduplication id, so every generation path also takes this lock.
 * It lasts 10 minutes and is renewed every minute until released; its owner is
 * the BullMQ job id, so a job run again after its worker died takes back the
 * lock its first run left behind instead of skipping itself.
 *
 * @module
 */

import type Redis from "ioredis"

import { LeaseLock } from "@/lib/locks/lease-lock"
import { RedisLeaseStore } from "@/lib/locks/redis-lease-store"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("GENERATION_LOCK")

const LOCK_TTL_MS = 600_000
const RENEW_EVERY_MS = 60_000

export interface GenerationLock {
  /** Stops the renewal and deletes the lock if this owner still holds it; true when it did. */
  release(): Promise<boolean>
}

/**
 * Takes `rw:lock:gen:{year}:{userId}` for `owner` (the BullMQ job id) and
 * renews it every minute until released. Returns null when another owner holds
 * it, in which case the caller ends its run as `skipped`; the same owner
 * takes it back. A Redis error propagates, so the run fails and retries
 * rather than being skipped.
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
  redis: Pick<Redis, "eval">,
  { year, userId, owner }: { year: number; userId: string; owner: string }
): Promise<GenerationLock | null> {
  const name = `rw:lock:gen:${year}:${userId}` as const
  const lock = new LeaseLock({ name, instanceId: owner, leaseDurationMs: LOCK_TTL_MS, store: new RedisLeaseStore(redis) })
  if (!(await lock.acquireOrThrow())) return null

  const renewal = setInterval(() => {
    lock.renew().then((renewed) => {
      if (renewed) return
      // Lost to expiry or a Redis error: the lease no longer counts as ours, so stop renewing
      clearInterval(renewal)
      logger.warn("Generation lock lost before renewal", { key: name })
    })
  }, RENEW_EVERY_MS)
  renewal.unref()

  return {
    release() {
      clearInterval(renewal)
      return lock.release()
    },
  }
}
