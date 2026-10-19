/**
 * A cross-process counting semaphore that caps concurrent upstream calls
 * (design 9.4): at most 4 at a time per service, across every process and
 * replica sharing the Redis.
 *
 * ## Algorithm
 *
 * Each service has a sorted set `rw:sem:<service>` whose members are holder
 * ids scored by their expiry time (Redis server time, so process clocks never
 * matter). One Lua script per operation keeps each step atomic:
 *
 * ```
 * acquire: drop holders whose expiry has passed
 *          fewer than `limit` left? add the holder with expiry now + ttl : refuse
 * renew:   holder still present and unexpired? push its expiry to now + ttl : refuse
 * release: remove the holder
 * ```
 *
 * A refused caller sleeps with jittered exponential backoff and tries again
 * until its `AbortSignal` aborts. A holder's TTL is 30 s and {@link RedisSemaphore.run}
 * renews it every 10 s while the call runs, so a slow call keeps its slot and a
 * crashed process's slots free themselves within 30 s.
 *
 * @module
 */

import { randomUUID } from "node:crypto"
import type Redis from "ioredis"

import { getRequestPathRedis, readyWithin } from "@/lib/queue/connection"
import { createLogger } from "@/lib/utils/logger"
import type { UpstreamLimiter, UpstreamService } from "@/lib/wrapped/sources/watch-history-source"

const logger = createLogger("REDIS_SEMAPHORE")

const NOW_MS = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)`

const ACQUIRE_SCRIPT = `${NOW_MS}
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[2]) then
  redis.call('ZADD', KEYS[1], now + tonumber(ARGV[3]), ARGV[1])
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
  return 1
end
return 0`

const RENEW_SCRIPT = `${NOW_MS}
local expiry = redis.call('ZSCORE', KEYS[1], ARGV[1])
if expiry and tonumber(expiry) > now then
  redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  return 1
end
return 0`

interface SemaphoreOptions {
  limit: number
  ttlMs: number
  renewEveryMs: number
  minBackoffMs: number
  maxBackoffMs: number
}

/** How long a command waits for a client that is still connecting before it is sent anyway (and fails fast). */
const READY_WAIT_MS = 2000

const DEFAULTS: SemaphoreOptions = {
  limit: 4,
  ttlMs: 30_000,
  renewEveryMs: 10_000,
  minBackoffMs: 50,
  maxBackoffMs: 1000,
}

/** Resolves after `ms`; rejects with the signal's reason as soon as it aborts. */
function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

export interface SemaphoreHolder {
  /** Pushes the holder's expiry out by the TTL; false when it had already expired. */
  renew(): Promise<boolean>
  release(): Promise<void>
}

export interface RedisSemaphore extends UpstreamLimiter {
  /** Waits for a slot; rejects with the signal's reason if it aborts first. */
  acquire(service: UpstreamService, signal?: AbortSignal): Promise<SemaphoreHolder>
  /**
   * Runs `fn` while holding a slot for `service`, renewing it on long calls and
   * releasing it in `finally`. This is P2.4's `UpstreamLimiter.run`; the
   * optional `options.signal` bounds the wait for a slot.
   */
  run<T>(service: UpstreamService, fn: () => Promise<T>, options?: { signal?: AbortSignal }): Promise<T>
}

/**
 * Builds a semaphore on the client `getClient` returns, called per command so
 * a client created lazily is only opened when first used.
 *
 * @example
 * ```ts
 * const semaphore = createRedisSemaphore(() => redis, { limit: 4 })
 * const rows = await semaphore.run("tautulli", () => fetchPage(1), { signal })
 * ```
 */
export function createRedisSemaphore(
  getClient: () => Redis,
  options: Partial<SemaphoreOptions> = {}
): RedisSemaphore {
  const { limit, ttlMs, renewEveryMs, minBackoffMs, maxBackoffMs } = { ...DEFAULTS, ...options }

  async function client(): Promise<Redis> {
    const redis = getClient()
    await readyWithin(redis, READY_WAIT_MS)
    return redis
  }

  async function acquire(service: UpstreamService, signal?: AbortSignal): Promise<SemaphoreHolder> {
    const key = `rw:sem:${service}`
    const id = randomUUID()
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted()
      if ((await (await client()).eval(ACQUIRE_SCRIPT, 1, key, id, limit, ttlMs)) === 1) break
      const backoff = Math.min(maxBackoffMs, minBackoffMs * 2 ** attempt)
      await sleep(Math.round(backoff * (0.5 + Math.random() * 0.5)), signal)
    }
    return {
      renew: async () => (await (await client()).eval(RENEW_SCRIPT, 1, key, id, ttlMs)) === 1,
      release: async () => {
        await (await client()).zrem(key, id)
      },
    }
  }

  async function run<T>(
    service: UpstreamService,
    fn: () => Promise<T>,
    options: { signal?: AbortSignal } = {}
  ): Promise<T> {
    const holder = await acquire(service, options.signal)
    const renewal = setInterval(() => {
      holder.renew().then(
        (renewed) => {
          if (!renewed) logger.warn("Semaphore slot expired during a call", { service })
        },
        (error: unknown) => logger.warn("Semaphore renewal failed", { service, error: String(error) })
      )
    }, renewEveryMs)
    renewal.unref()
    try {
      return await fn()
    } finally {
      clearInterval(renewal)
      await holder.release().catch((error: unknown) => {
        // The slot then frees itself when its TTL passes.
        logger.warn("Semaphore release failed", { service, error: String(error) })
      })
    }
  }

  return { acquire, run }
}

/**
 * The server-wide upstream limiter: 4 concurrent calls per service, on the
 * fail-fast request-path client, so a Redis outage fails the call instead of
 * hanging it. Implements P2.4's `UpstreamLimiter`.
 */
export const redisLimiter: RedisSemaphore = createRedisSemaphore(getRequestPathRedis)
