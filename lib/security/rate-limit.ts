/**
 * Named rate limits backed by Redis, with an in-process fallback.
 *
 * ## Overview
 *
 * Every limit has a name in {@link LIMITS}. The name is also the key prefix,
 * so the counters of different features never mix: a share-page visitor and
 * an admin on the same address have separate `share:<ip>` and `admin:<ip>`
 * buckets.
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
 * waits for Redis.
 *
 * ## Naming
 *
 * Names are `feature` or `feature:scope`, such as `auth:jellyfin:user`.
 * Rewind limits start with `rw:`.
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

import { clientIp } from "@/lib/security/client-ip"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("RATE_LIMIT")

const MINUTE = 60

interface LimitConfig {
  /** Requests allowed per window. */
  points: number
  /** Window length in seconds. */
  duration: number
}

export const LIMITS = {
  share: { points: 100, duration: 15 * MINUTE },
  poster: { points: 500, duration: 15 * MINUTE },
  admin: { points: 50, duration: 15 * MINUTE },
  checkout: { points: 10, duration: MINUTE },
  portal: { points: 10, duration: MINUTE },
  "discord-link": { points: 5, duration: 5 * MINUTE },
  "auth:plex": { points: 20, duration: 15 * MINUTE },
  "auth:jellyfin:ip": { points: 10, duration: 15 * MINUTE },
  "auth:jellyfin:user": { points: 5, duration: 15 * MINUTE },
  "invite:validate": { points: 20, duration: 15 * MINUTE },
  "invite:redeem": { points: 10, duration: 15 * MINUTE },
  "plex:pin:create": { points: 30, duration: 10 * MINUTE },
  "plex:pin:poll": { points: 300, duration: 10 * MINUTE },
} as const satisfies Record<string, LimitConfig>

export type LimitName = keyof typeof LIMITS

export type ConsumeResult = { ok: true } | { ok: false; retryAfterSec: number }

/** `undefined` until the first limiter is built, then the client or `null` without `REDIS_URL`. */
let redisClient: Redis | null | undefined
/** Settles once the client's first connection attempt has succeeded or failed. */
let firstConnection: Promise<void> = Promise.resolve()
const limiters = new Map<LimitName, RateLimiterAbstract>()

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) {
    return redisClient
  }

  const url = process.env.REDIS_URL
  if (!url) {
    redisClient = null
    return redisClient
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
  firstConnection = client.connect().catch(() => undefined)

  redisClient = client
  return client
}

async function getLimiter(name: LimitName): Promise<RateLimiterAbstract> {
  let limiter = limiters.get(name)
  if (!limiter) {
    const options = { ...LIMITS[name], keyPrefix: name }
    const client = getRedisClient()
    limiter = client
      ? new RateLimiterRedis({ ...options, storeClient: client, insuranceLimiter: new RateLimiterMemory(options) })
      : new RateLimiterMemory(options)
    limiters.set(name, limiter)
  }

  await firstConnection
  return limiter
}

/**
 * Spends one point of `name` for `subject` (an IP address, user id or
 * lowercased username).
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

/** The calling client's address inside a Server Action or Server Component. */
export async function actionClientIp(): Promise<string> {
  return clientIp(await headers())
}
