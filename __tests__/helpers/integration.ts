/**
 * Gating for the Postgres- and Redis-backed Jest suites (`*.pg.test.ts` and
 * `*.redis.test.ts`).
 *
 * jest.config.js loads these suites only in `npm run test:integration`, which
 * runs them one at a time, because they share one TEST_DATABASE_URL (some of
 * them empty and count whole tables) and one TEST_REDIS_URL. In that run:
 *
 * - The variable set: it is validated before any connection is made. A
 *   database URL must name a database ending in `_test` (P0.4's
 *   `assertTestDatabaseUrl`).
 * - The variable unset, locally: the suites are skipped.
 * - The variable unset under `CI`: the suites fail, so a gated test can never
 *   pass in CI by being skipped.
 *
 * @module
 */

import { assertTestDatabaseUrl } from "@/lib/security/test-mode"

type Env = Record<string, string | undefined>

/**
 * Returns the validated test database URL, or null when the suites should skip.
 *
 * @throws When TEST_DATABASE_URL is unset under `CI`, or names a database whose
 *   name does not end in `_test`.
 */
export function resolveTestDatabaseUrl(env: Env): string | null {
  const url = env.TEST_DATABASE_URL
  if (url !== undefined) {
    return assertTestDatabaseUrl(url)
  }
  if (env.CI) {
    throw new Error("TEST_DATABASE_URL must be set in CI, or the Postgres-backed suites would be skipped")
  }
  return null
}

/**
 * Returns the test Redis URL, or null when the suites should skip.
 *
 * @throws When TEST_REDIS_URL is unset under `CI`, or is not a `redis:` or
 *   `rediss:` URL.
 */
export function resolveTestRedisUrl(env: Env): string | null {
  const url = env.TEST_REDIS_URL
  if (url !== undefined) {
    const protocol = URL.canParse(url) ? new URL(url).protocol : ""
    if (protocol !== "redis:" && protocol !== "rediss:") {
      throw new Error("TEST_REDIS_URL must be a redis:// or rediss:// URL")
    }
    return url
  }
  if (env.CI) {
    throw new Error("TEST_REDIS_URL must be set in CI, or the Redis-backed suites would be skipped")
  }
  return null
}

function gatedDescribe(name: string, url: string | null, fn: (url: string) => void): void {
  if (url === null) {
    // A skipped describe still collects its tests, but never runs them or their hooks.
    describe.skip(name, () => fn(""))
    return
  }
  describe(name, () => fn(url))
}

/**
 * `describe` for a Postgres-backed suite. The body receives the validated test
 * database URL; it is skipped locally when TEST_DATABASE_URL is unset.
 */
export function describePg(name: string, fn: (databaseUrl: string) => void): void {
  gatedDescribe(name, resolveTestDatabaseUrl(process.env), fn)
}

/**
 * `describe` for a Redis-backed suite. The body receives the test Redis URL;
 * it is skipped locally when TEST_REDIS_URL is unset.
 */
export function describeRedis(name: string, fn: (redisUrl: string) => void): void {
  gatedDescribe(name, resolveTestRedisUrl(process.env), fn)
}
