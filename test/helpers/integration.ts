/**
 * Gating for the Postgres-backed Jest suites (`*.pg.test.ts`).
 *
 * jest.config.js loads these suites only in `npm run test:pg`, which runs them
 * one at a time, because they share one TEST_DATABASE_URL and some of them
 * empty and count whole tables. In that run:
 *
 * - TEST_DATABASE_URL set: it must name a database ending in `_test` (P0.4's
 *   `assertTestDatabaseUrl`), checked before any connection is made.
 * - TEST_DATABASE_URL unset, locally: the suites are skipped.
 * - TEST_DATABASE_URL unset under `CI`: the suites fail, so a gated test can
 *   never pass in CI by being skipped.
 *
 * @module
 */

import { assertTestDatabaseUrl } from "@/lib/security/test-mode"

/**
 * Returns the validated test database URL, or null when the suites should skip.
 *
 * @throws When TEST_DATABASE_URL is unset under `CI`, or names a database whose
 *   name does not end in `_test`.
 */
export function resolveTestDatabaseUrl(env: Record<string, string | undefined>): string | null {
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
 * `describe` for a Postgres-backed suite. The body receives the validated test
 * database URL; it is skipped locally when TEST_DATABASE_URL is unset.
 */
export function describePg(name: string, fn: (databaseUrl: string) => void): void {
  const databaseUrl = resolveTestDatabaseUrl(process.env)
  if (databaseUrl === null) {
    // A skipped describe still collects its tests, but never runs them or their hooks.
    describe.skip(name, () => fn(""))
    return
  }
  describe(name, () => fn(databaseUrl))
}
