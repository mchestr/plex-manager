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
 * @returns The number of keys deleted, or `null` when Redis was unreachable
 */
export async function clearRateLimits(redisUrl: string): Promise<number | null> {
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
    for (const name of Object.keys(LIMITS)) {
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
