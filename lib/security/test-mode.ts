/**
 * Guards for test-only code paths: destructive E2E runs and the seed.
 *
 * This is a plain module with no `@/` imports, so Jest, the Playwright config
 * and `prisma/seed.ts` (run by tsx) can all import it without path aliases.
 *
 * @module lib/security/test-mode
 */

/** Hosts the seed may target even when the database name does not end in `_test`. */
const LOCAL_SEED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "db", "db-playwright"])

const POSTGRES_URL_PREFIX = /^postgres(ql)?:\/\//

/**
 * The environment the guards read (`NODE_ENV`, `E2E_TEST_MODE`, `DATABASE_URL`).
 * An index signature, so `process.env` fits under both Next's types and plain `@types/node`.
 */
type TestModeEnv = Readonly<Record<string, string | undefined>>

interface ParsedDatabaseUrl {
  url: string
  /** The host the pg driver connects to, after any `?host=` override. */
  host: string
  database: string
}

/**
 * Returns the URL with its password and any `password` query parameter
 * replaced by `***`, for error messages and logs.
 *
 * When the URL parser cannot find a host, the credentials cannot be told apart
 * from the rest (a password may contain `/`, `:` or `@`), so everything between
 * the scheme and the last `@`, and the whole query, is hidden instead.
 */
export function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.host) {
      if (parsed.password) parsed.password = "***"
      if (parsed.searchParams.has("password")) parsed.searchParams.set("password", "***")
      return parsed.toString()
    }
  } catch {
    // Not a parseable URL: mask by pattern below.
  }
  return url.replace(/^([^:/?#@]*:\/*)[\s\S]*@/, "$1***@").replace(/\?[\s\S]*$/, "?***")
}

function decodeOrRefuse(decode: (value: string) => string, value: string, url: string): string {
  try {
    return decode(value)
  } catch {
    throw new Error(`Refusing to use the database: ${maskDatabaseUrl(url)} is not a valid URL.`)
  }
}

/**
 * Reads the host and database the way the pg driver (`pg-connection-string`)
 * does, so the checks and the seed's log describe the server it really
 * connects to: a non-empty `?host=` query parameter replaces the URL's host
 * (the last one wins, as in the driver), and both the host and the database
 * (the path) are decoded with the driver's own functions.
 */
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

  if (!POSTGRES_URL_PREFIX.test(url)) {
    throw new Error(
      `Refusing to use the database: ${maskDatabaseUrl(url)} is not a postgres:// or postgresql:// URL.`
    )
  }

  const hostOverride = parsed.searchParams.getAll("host").pop()
  const host = hostOverride || decodeOrRefuse(decodeURIComponent, parsed.hostname, url)

  return {
    url,
    host: host.replace(/^\[(.*)\]$/, "$1"),
    database: decodeOrRefuse(decodeURI, parsed.pathname.replace(/^\//, ""), url),
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
 *
 * @internal
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
 * or the compose services `db` and `db-playwright`). The host is the one the
 * driver connects to, so `?host=` overrides and socket paths count.
 *
 * @example
 * ```ts
 * assertSeedTarget('postgresql://postgres:pw@localhost:5432/plex_wrapped')
 * // => { url: '...', host: 'localhost', database: 'plex_wrapped' }
 *
 * assertSeedTarget('postgresql://postgres:pw@localhost:5432/plex_wrapped?host=db.example.com')
 * // => throws: host "db.example.com" is neither local nor a _test database
 * ```
 *
 * @internal
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
 * Gates the seed. `NODE_ENV=test` on its own never enables it.
 */
export function isE2ETestMode(env: TestModeEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.E2E_TEST_MODE === "true"
}

/**
 * Returns the seed's target, or throws before reading the URL unless
 * {@link isE2ETestMode} is true for `env`.
 *
 * @example
 * ```ts
 * resolveSeedTarget({ E2E_TEST_MODE: 'true', DATABASE_URL: 'postgresql://u:pw@localhost/plex_manager_test' })
 * // => { url: '...', host: 'localhost', database: 'plex_manager_test' }
 *
 * resolveSeedTarget({ DATABASE_URL: 'postgresql://u:pw@localhost/plex_manager_test' })
 * // => throws: set E2E_TEST_MODE=true
 * ```
 *
 * @internal
 */
export function resolveSeedTarget(env: TestModeEnv = process.env): ParsedDatabaseUrl {
  if (!isE2ETestMode(env)) {
    throw new Error(
      "Refusing to seed: set E2E_TEST_MODE=true (never in production) to confirm this is a disposable database."
    )
  }
  return assertSeedTarget(env.DATABASE_URL)
}
