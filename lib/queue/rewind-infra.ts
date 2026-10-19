/**
 * The FR-50 Redis check for Rewind's request paths. Rewind has no Postgres
 * fallback (design 13.5): without a reachable Redis nothing is enqueued, and
 * the caller shows `rewindInfraMessage` (`lib/rewind/infra-copy.ts`) for the
 * returned code.
 *
 * @module
 */

import type Redis from "ioredis"

import { getRequestPathRedis, isRedisConfigured, readyWithin } from "@/lib/queue/connection"
import type { RewindInfraCode } from "@/lib/rewind/infra-copy"

export type RewindInfraStatus = { ok: true } | { ok: false; code: RewindInfraCode }

const PING_DEADLINE_MS = 2000
const CACHE_MS = 10_000

let cached: { result: Promise<RewindInfraStatus>; expiresAt: number } | null = null

/**
 * Resolves true once `client` answers a ping, waiting for it to finish
 * connecting first; false at the deadline or on any error.
 */
function pingWithin(client: Redis, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms)
  })
  const answer = readyWithin(client, ms).then(
    (ready) =>
      ready &&
      client.ping().then(
        () => true,
        () => false
      )
  )
  return Promise.race([answer, deadline]).finally(() => clearTimeout(timer))
}

/**
 * Returns `REDIS_NOT_CONFIGURED` without `REDIS_URL`, `REDIS_UNAVAILABLE` when
 * Redis does not answer a ping within 2 s, and `{ ok: true }` otherwise. The
 * result is cached for 10 s, so a burst of requests during an outage costs one
 * probe.
 *
 * @example
 * ```ts
 * const infra = await checkRewindInfra()
 * if (!infra.ok) return { error: rewindInfraMessage(infra.code, "member") }
 * ```
 */
export async function checkRewindInfra(): Promise<RewindInfraStatus> {
  if (!isRedisConfigured()) return { ok: false, code: "REDIS_NOT_CONFIGURED" }
  const now = Date.now()
  if (!cached || cached.expiresAt <= now) {
    const result = pingWithin(getRequestPathRedis(), PING_DEADLINE_MS).then(
      (ok): RewindInfraStatus => (ok ? { ok: true } : { ok: false, code: "REDIS_UNAVAILABLE" })
    )
    cached = { result, expiresAt: now + CACHE_MS }
  }
  return cached.result
}
