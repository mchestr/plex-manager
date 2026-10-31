/**
 * The per-member access lock (P11.3): a {@link LeaseLock} named
 * `access:<userId>` on the {@link RedisLeaseStore}, so a grant and a revoke of
 * one member's access never run at once. Their jobs keep their per-event ids;
 * this only serialises them.
 *
 * @module
 */

import type Redis from "ioredis"

import { LeaseLock } from "@/lib/locks/lease-lock"
import { RedisLeaseStore } from "@/lib/locks/redis-lease-store"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("ACCESS_LOCK")

/** Long enough for a Plex share and a Jellyfin call; renewed while the work runs. */
const LEASE_MS = 5 * 60_000
const RENEW_EVERY_MS = 60_000

/** Thrown when the other job still holds the member's lock after the wait; BullMQ retries the job, and the inactivity sweep skips the member. */
export class AccessLockBusyError extends Error {
  constructor(userId: string) {
    super(`Another access change for ${userId} is running`)
    this.name = "AccessLockBusyError"
  }
}

interface AccessLockOptions {
  redis: Pick<Redis, "eval">
  /** How long to wait for the other job before giving up. */
  waitMs?: number
  pollMs?: number
}

/**
 * Runs `fn` while holding `access:<userId>` for `owner` (the job id, so a job
 * run again after its worker died takes back its own lock). Waits up to
 * `waitMs` for another holder, then throws {@link AccessLockBusyError}.
 */
export async function withAccessLock<T>(
  userId: string,
  owner: string,
  fn: () => Promise<T>,
  { redis, waitMs = 30_000, pollMs = 500 }: AccessLockOptions
): Promise<T> {
  const lock = new LeaseLock({ name: `access:${userId}`, instanceId: owner, leaseDurationMs: LEASE_MS, store: new RedisLeaseStore(redis) })
  const deadline = Date.now() + waitMs
  while (!(await lock.acquireOrThrow())) {
    if (Date.now() >= deadline) throw new AccessLockBusyError(userId)
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }

  const renewal = setInterval(() => {
    lock.renew().then((renewed) => {
      if (renewed) return
      clearInterval(renewal)
      logger.warn("Access lock lost before renewal", { userId })
    })
  }, RENEW_EVERY_MS)
  renewal.unref()

  try {
    return await fn()
  } finally {
    clearInterval(renewal)
    await lock.release()
  }
}
