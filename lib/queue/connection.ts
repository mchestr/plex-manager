/**
 * Redis Connection Manager for BullMQ
 *
 * Provides shared Redis connections for all queue operations.
 * Uses lazy initialization to avoid connecting during build.
 */

import type { Worker } from "bullmq"
import Redis, { RedisOptions } from "ioredis"
import { onShutdown } from "@/lib/instrumentation/shutdown"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("QUEUE_CONNECTION")

let redisConnection: Redis | null = null

/**
 * Get Redis connection options from environment
 */
function getRedisOptions(): RedisOptions {
  return {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  }
}

/**
 * Get the Redis URL from environment
 * @throws Error if REDIS_URL is not configured
 */
function getRedisUrl(): string {
  const url = process.env.REDIS_URL
  if (!url) {
    throw new Error("REDIS_URL environment variable is required for queue operations")
  }
  return url
}

/**
 * Check if Redis is configured
 */
export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL
}

/**
 * Get or create the shared Redis connection
 * Uses lazy initialization - connection is only created when first accessed
 */
export function getRedisConnection(): Redis {
  if (!redisConnection) {
    const url = getRedisUrl()
    redisConnection = new Redis(url, getRedisOptions())

    redisConnection.on("error", (err) => {
      logger.error("Redis connection error", err)
    })

    redisConnection.on("connect", () => {
      logger.info("Redis connected")
    })

    redisConnection.on("close", () => {
      logger.debug("Redis connection closed")
    })

    redisConnection.on("reconnecting", () => {
      logger.debug("Redis reconnecting")
    })
  }

  return redisConnection
}

/**
 * Close the Redis connection gracefully
 * Should be called during application shutdown
 */
export async function closeRedisConnection(): Promise<void> {
  const connection = redisConnection
  if (connection) {
    redisConnection = null
    try {
      await connection.quit()
      logger.info("Redis connection closed gracefully")
    } catch (error) {
      logger.error("Error closing Redis connection", error)
      // Force disconnect if quit fails
      connection.disconnect()
    }
  }
}

/**
 * Closes a BullMQ Worker on the shared connection at shutdown, letting its
 * active jobs finish while Redis is connected. While the connection is down or
 * reconnecting, BullMQ's graceful close waits on a job fetch that never
 * settles (it held shutdown past its deadline in the image smoke test), and no
 * job could record its result anyway, so the close is forced; the stall check
 * hands any active job to the next worker.
 */
export function closeWorker(worker: Pick<Worker, "close">): Promise<void> {
  return worker.close(redisConnection?.status !== "ready")
}

/**
 * Check if Redis connection is healthy
 */
export async function isRedisHealthy(): Promise<boolean> {
  if (!redisConnection) {
    return false
  }

  try {
    const result = await redisConnection.ping()
    return result === "PONG"
  } catch {
    return false
  }
}

/**
 * A Redis client whose commands fail within about two seconds instead of
 * queueing while Redis is down. The shared BullMQ connection above waits
 * forever (BullMQ needs `maxRetriesPerRequest: null`), so code that must not
 * hang on Redis, such as the boot probe and request-path reads, uses this.
 * It connects on the first {@link waitForRedis} attempt or `connect()` call.
 */
export function createFailFastRedis(url: string): Redis {
  const client = new Redis(url, {
    enableOfflineQueue: false,
    connectTimeout: 2000,
    commandTimeout: 2000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  })
  client.on("error", (err) => {
    logger.debug("Fail-fast Redis error", { error: err.message })
  })
  return client
}

let requestPathRedis: Redis | null = null

/**
 * The shared fail-fast client for request paths (BP-20): Server Actions and
 * route handlers that touch Redis get an error within about two seconds while
 * Redis is down, instead of hanging on the BullMQ connection. It starts
 * connecting when first asked for, and is closed on shutdown.
 *
 * @throws Error if REDIS_URL is not configured
 */
export function getRequestPathRedis(): Redis {
  if (!requestPathRedis) {
    const client = createFailFastRedis(getRedisUrl())
    // Offline queueing is off, so the client must be connecting before its first command.
    client.connect().catch((error: unknown) => {
      logger.warn("Request-path Redis connect failed", {
        error: error instanceof Error ? error.message : String(error),
      })
    })
    onShutdown("request-path-redis", "close", async () => {
      client.disconnect()
    })
    requestPathRedis = client
  }
  return requestPathRedis
}

/**
 * Resolves true once `client` is ready (at once when it already is), or false
 * after `ms`. A fail-fast client refuses commands while it is still
 * connecting, so its callers wait here first; a lazy client that has not
 * connected yet, or one that gave up reconnecting, is told to connect.
 */
export function readyWithin(client: Redis, ms: number): Promise<boolean> {
  if (client.status === "ready") return Promise.resolve(true)
  return new Promise((resolve) => {
    const settle = (ready: boolean) => {
      clearTimeout(timer)
      client.off("ready", onReady)
      resolve(ready)
    }
    const onReady = () => settle(true)
    const timer = setTimeout(() => settle(false), ms)
    client.once("ready", onReady)
    if (client.status === "wait" || client.status === "end") client.connect().catch(() => {})
  })
}

type RedisProbe = Pick<Redis, "status" | "connect" | "ping">

interface WaitForRedisOptions {
  attempts: number
  baseDelayMs: number
  maxDelayMs: number
  signal: AbortSignal
}

/** Resolves after `ms`, or as soon as `signal` aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener("abort", done, { once: true })
  })
}

/**
 * Pings `client` until Redis answers, with exponential backoff between
 * attempts: doubling from `baseDelayMs`, capped at `maxDelayMs`, with ±20%
 * jitter. With the boot settings (8 attempts, 1 s to 30 s) it waits about two
 * minutes, long enough for a Redis container that starts after the app.
 *
 * @returns true once a ping succeeds; false when the attempts run out or
 * `signal` aborts
 *
 * @example
 * ```ts
 * const reachable = await waitForRedis(createFailFastRedis(url), {
 *   attempts: 8, baseDelayMs: 1000, maxDelayMs: 30_000, signal: shutdownSignal,
 * })
 * ```
 */
export async function waitForRedis(client: RedisProbe, options: WaitForRedisOptions): Promise<boolean> {
  const { attempts, baseDelayMs, maxDelayMs, signal } = options
  for (let attempt = 1; attempt <= attempts && !signal.aborted; attempt++) {
    try {
      if (client.status === "wait") await client.connect()
      await client.ping()
      if (attempt > 1) logger.info("Redis reachable", { attempt })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === attempts) {
        logger.warn("Redis unreachable", { attempt, attempts, error: message })
        break
      }
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
      const delayMs = Math.round(backoff * (0.8 + Math.random() * 0.4))
      logger.warn("Redis unreachable, retrying", { attempt, attempts, delayMs, error: message })
      await sleep(delayMs, signal)
    }
  }
  return false
}
