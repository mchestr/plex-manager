import Redis from 'ioredis'

import { LIMITS } from '../../lib/security/rate-limit-config'

/**
 * Deletes the rate-limit counters that earlier runs left in Redis, so every
 * E2E run starts with full budgets. Without this, a second local run within a
 * limit's window (15 minutes for `invite:validate`) starts part-spent, and the
 * invite pages show "Too many attempts".
 *
 * Only keys under the {@link LIMITS} prefixes are touched, never BullMQ's. An
 * unreachable Redis is reported and skipped: the app then counts in memory,
 * and the web server starts fresh for each run unless E2E_REUSE_SERVER=1.
 *
 * A spec that asserts on a limited write can pass `names` to start that
 * limit fresh mid-run, since earlier specs signed in as the same member spend it.
 *
 * @returns The number of keys deleted, or `null` when Redis was unreachable
 */
export async function clearRateLimits(redisUrl: string, names: readonly (keyof typeof LIMITS)[] = Object.keys(LIMITS) as (keyof typeof LIMITS)[]): Promise<number | null> {
  // One attempt, no reconnects: a setup step either reaches Redis or moves on.
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: () => null,
  })
  // Connection errors surface through connect() below; this stops the
  // unhandled 'error' event from printing a stack trace as well.
  redis.on('error', () => undefined)
  try {
    await redis.connect()
    let deleted = 0
    for (const name of names) {
      for await (const keys of redis.scanStream({ match: `${name}:*`, count: 500 })) {
        const batch = keys as string[]
        if (batch.length > 0) {
          deleted += await redis.del(...batch)
        }
      }
    }
    return deleted
  } catch (error) {
    console.warn('[E2E Setup] Could not clear rate-limit counters in Redis:', error instanceof Error ? error.message : error)
    return null
  } finally {
    // A failed connection has already ended; disconnecting it again would
    // leave ioredis's two-second socket clean-up timer holding the process.
    if (redis.status !== 'end') {
      redis.disconnect()
    }
  }
}

/**
 * Whether Redis at `redisUrl` answers a ping within two seconds. Rewind has
 * no fallback without Redis (FR-50), so global setup stops the run when it
 * does not: no baseline is ever taken of the unavailable panel.
 */
export async function redisAnswers(redisUrl: string | undefined): Promise<boolean> {
  if (!redisUrl) return false
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: () => null,
  })
  redis.on('error', () => undefined)
  try {
    await redis.connect()
    return (await redis.ping()) === 'PONG'
  } catch {
    return false
  } finally {
    if (redis.status !== 'end') {
      redis.disconnect()
    }
  }
}
