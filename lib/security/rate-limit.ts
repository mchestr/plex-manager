/**
 * Named rate limits backed by Redis, with an in-process fallback.
 *
 * ## Overview
 *
 * Every limit has a name in {@link LIMITS} (`lib/security/rate-limit-config.ts`).
 * The name is also the key prefix, so the counters of different features never
 * mix: a share-page visitor and an admin on the same address have separate
 * `share:<ip>` and `admin:<ip>` buckets.
 *
 * ## Store
 *
 * - With `REDIS_URL` set, each limit is a `RateLimiterRedis`, so counts hold
 *   across processes and restarts. Its insurance store is a `RateLimiterMemory`
 *   with the same prefix, used whenever a Redis command fails, so a Redis
 *   outage degrades to per-process limits instead of failing requests.
 * - Without `REDIS_URL`, the same in-process store is used directly. The keys
 *   are identical either way.
 *
 * The limiters share one ioredis client of their own. The BullMQ connection in
 * `lib/queue/connection.ts` retries forever (`maxRetriesPerRequest: null`),
 * which would hang requests while Redis is down. This client fails fast
 * instead: no offline queue, one retry, and one-second connect and command
 * timeouts. The first limited request waits for the first connection attempt
 * to settle, so it is counted in Redis when Redis is up; after that no request
 * waits for Redis. In development the client is kept on `globalThis`, so
 * `next dev` reloading this module does not open another connection.
 *
 * @module lib/security/rate-limit
 */

import "server-only"

import Redis from "ioredis"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import {
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
  type RateLimiterAbstract,
} from "rate-limiter-flexible"

import { clientIp, trustedProxyHops } from "@/lib/security/client-ip"
import { LIMITS, type LimitName } from "@/lib/security/rate-limit-config"
import { createLogger } from "@/lib/utils/logger"

export { LIMITS, type LimitName }

const logger = createLogger("RATE_LIMIT")

export type ConsumeResult = { ok: true } | { ok: false; retryAfterSec: number }

interface RedisState {
  /** The limiters' client, or `null` without `REDIS_URL`. */
  client: Redis | null
  /** Settles once the client's first connection attempt has succeeded or failed. */
  firstConnection: Promise<void>
}

const globalForRateLimit = globalThis as typeof globalThis & { rateLimitRedis?: RedisState }

let redisState: RedisState | undefined
const limiters = new Map<LimitName, RateLimiterAbstract>()

function connectRedis(): RedisState {
  const url = process.env.REDIS_URL
  if (!url) {
    return { client: null, firstConnection: Promise.resolve() }
  }

  const client = new Redis(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: 1000,
    commandTimeout: 1000,
  })
  // ioredis emits an error on every failed reconnect; report each outage once.
  let outageReported = false
  client.on("error", (error: Error) => {
    if (!outageReported) {
      outageReported = true
      logger.warn("Rate-limit Redis unavailable, using the in-process store", { error: error.message })
    }
  })
  client.on("ready", () => {
    outageReported = false
  })
  // A failed attempt is reported by the error listener, and ioredis keeps
  // reconnecting; until then commands fail and the insurance store counts.
  return { client, firstConnection: client.connect().catch(() => undefined) }
}

function getRedis(): RedisState {
  if (!redisState) {
    const isDevelopment = process.env.NODE_ENV === "development"
    redisState = (isDevelopment ? globalForRateLimit.rateLimitRedis : undefined) ?? connectRedis()
    if (isDevelopment) {
      globalForRateLimit.rateLimitRedis = redisState
    }
  }
  return redisState
}

async function getLimiter(name: LimitName): Promise<RateLimiterAbstract> {
  let limiter = limiters.get(name)
  if (!limiter) {
    const { client } = getRedis()
    if (limiters.size === 0) {
      logger.info("Rate limits ready", { store: client ? "redis" : "memory", trustedProxyHops: trustedProxyHops() })
    }
    const options = { ...LIMITS[name], keyPrefix: name }
    limiter = client
      ? new RateLimiterRedis({ ...options, storeClient: client, insuranceLimiter: new RateLimiterMemory(options) })
      : new RateLimiterMemory(options)
    limiters.set(name, limiter)
  }

  await getRedis().firstConnection
  return limiter
}

/**
 * Spends one point of `name` for `subject`: a {@link clientIp} address, a user
 * id or a username hash.
 *
 * @returns `{ ok: true }` while within the limit, otherwise `{ ok: false }`
 * with the whole seconds until the next point frees up
 *
 * @example
 * ```ts
 * const limit = await consume("invite:validate", await actionClientIp())
 * if (!limit.ok) return { success: false, code: "RATE_LIMITED", error: RATE_LIMITED_MESSAGE }
 * ```
 */
export async function consume(name: LimitName, subject: string): Promise<ConsumeResult> {
  try {
    await (await getLimiter(name)).consume(subject)
    return { ok: true }
  } catch (rejection) {
    if (rejection instanceof RateLimiterRes) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil(rejection.msBeforeNext / 1000)) }
    }
    throw rejection
  }
}

/** Refunds one point of `name` to `subject`. */
export async function reward(name: LimitName, subject: string): Promise<void> {
  await (await getLimiter(name)).reward(subject)
}

/**
 * Applies `name` to a route handler's request, keyed by {@link clientIp}.
 *
 * @returns `null` when the request may proceed, otherwise a 429 response with
 * `Retry-After`
 */
export async function limitRequest(name: LimitName, request: Request): Promise<NextResponse | null> {
  const result = await consume(name, clientIp(request.headers))
  if (result.ok) {
    return null
  }

  return NextResponse.json(
    { error: "Too many requests", code: "RATE_LIMIT_EXCEEDED", retryAfter: result.retryAfterSec },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } }
  )
}

/**
 * The calling client's {@link clientIp} address (IPv4, or an IPv6 /64) inside
 * a Server Action or Server Component.
 */
export async function actionClientIp(): Promise<string> {
  return clientIp(await headers())
}
