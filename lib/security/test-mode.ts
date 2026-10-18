/**
 * Guards for test-only code paths: destructive E2E runs, the seed, test-token
 * login and the setup-wizard dev prefill.
 *
 * This is a plain module with no `@/` imports, so Jest, the Playwright config
 * and `prisma/seed.ts` (run by ts-node without path aliases) can all import it.
 *
 * @module lib/security/test-mode
 */

/** Hosts the seed may target even when the database name does not end in `_test`. */
const LOCAL_SEED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "db", "db-playwright"])

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"])

interface ParsedDatabaseUrl {
  url: string
  host: string
  database: string
}

/**
 * Returns the URL with any password replaced by `***`, for error messages and logs.
 * Falls back to a pattern replacement when the string is not a parseable URL.
 */
export function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.password) parsed.password = "***"
    return parsed.toString()
  } catch {
    return url.replace(/\/\/([^:/@]*):[^/]*@/, "//$1:***@")
  }
}

function parsePostgresUrl(url: string | undefined): ParsedDatabaseUrl {
  if (!url) {
    throw new Error(
      "Refusing to use the database: no database URL is set. Point E2E_DATABASE_URL at a database whose name ends in _test."
    )
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Refusing to use the database: ${maskDatabaseUrl(url)} is not a valid URL.`)
  }

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `Refusing to use the database: ${maskDatabaseUrl(url)} is not a postgres:// or postgresql:// URL.`
    )
  }

  return {
    url,
    host: parsed.hostname.replace(/^\[(.*)\]$/, "$1"),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
  }
}

/**
 * Throws unless `url` is a PostgreSQL URL whose database name ends in `_test`.
 *
 * Every destructive test entry point (Playwright config, `createE2EPrismaClient`,
 * the setup-wizard spec, Postgres-backed Jest tests) calls this so that each one
 * refuses a development or production database on its own. The error shows the
 * URL with its password masked.
 *
 * @param url - The connection string to check, usually `process.env.E2E_DATABASE_URL`
 * @returns The same URL, so callers can assign it in one step
 *
 * @example
 * ```ts
 * assertTestDatabaseUrl('postgresql://postgres:pw@localhost:5433/plex_manager_test?schema=public')
 * // => returns the URL unchanged
 *
 * assertTestDatabaseUrl('postgresql://postgres:pw@localhost:5432/plex_wrapped')
 * // => throws: ... database "plex_wrapped" ... postgresql://postgres:***@localhost:5432/plex_wrapped
 * ```
 */
export function assertTestDatabaseUrl(url: string | undefined): string {
  const target = parsePostgresUrl(url)
  if (!target.database.endsWith("_test")) {
    throw new Error(
      `Refusing to use database "${target.database}" (${maskDatabaseUrl(target.url)}): its name must end in _test.`
    )
  }
  return target.url
}

/**
 * Checks the seed's target and returns its host and database name for logging.
 *
 * The seed wipes users and configuration, so it accepts only a database whose
 * name ends in `_test` or one on a local host (`localhost`, `127.0.0.1`, `::1`,
 * or the compose services `db` and `db-playwright`).
 *
 * @example
 * ```ts
 * assertSeedTarget('postgresql://postgres:pw@localhost:5432/plex_wrapped')
 * // => { url: '...', host: 'localhost', database: 'plex_wrapped' }
 *
 * assertSeedTarget('postgresql://postgres:pw@db.example.com:5432/plex_wrapped')
 * // => throws: neither local nor a _test database
 * ```
 */
export function assertSeedTarget(url: string | undefined): ParsedDatabaseUrl {
  const target = parsePostgresUrl(url)
  if (!target.database.endsWith("_test") && !LOCAL_SEED_HOSTS.has(target.host)) {
    throw new Error(
      `Refusing to seed database "${target.database}" on host "${target.host}" (${maskDatabaseUrl(target.url)}): ` +
        "the seed only runs against a local host or a database whose name ends in _test."
    )
  }
  return target
}

/**
 * True only outside production when `E2E_TEST_MODE=true` is set explicitly.
 *
 * Gates test-token login, the setup-wizard dev prefill and the seed. `NODE_ENV=test`
 * on its own never enables any of them.
 */
export function isE2ETestMode(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.E2E_TEST_MODE === "true"
}
