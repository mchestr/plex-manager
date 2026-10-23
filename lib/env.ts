import "server-only"

import path from "node:path"
import { z } from "zod"

import { isValidSchemaName, schemaParamOf } from "@/lib/db/schema-param"
import { createLogger } from "@/lib/utils/logger"

/**
 * Every environment variable the app reads, with the boot-time production check.
 *
 * The schema never throws: every field is optional or defaulted, so `next build`
 * (whose Docker builder sets only a placeholder `DATABASE_URL`) and Jest can
 * import it. Production refuses to start through {@link assertBootEnv} instead.
 * `__tests__/config/env-coverage.test.ts` fails when code reads a variable this
 * schema and `example.env` do not describe.
 *
 * @module
 */

const text = (description: string) => z.string().optional().describe(description)

/** @internal */
export const envSchema = z.object({
  // Core
  DATABASE_URL: text("PostgreSQL connection string."),
  NEXTAUTH_URL: text("The app's URL, for NextAuth callbacks and session cookies. https in production."),
  NEXT_PUBLIC_APP_URL: text("Public URL for share links and OG images. Falls back to NEXTAUTH_URL."),
  NEXTAUTH_SECRET: text("Signs session cookies. At least 32 random characters: openssl rand -base64 32."),
  PLEX_CLIENT_IDENTIFIER: text("Unique id this install reports to Plex: openssl rand -hex 16."),
  ENCRYPTION_KEY: text("Encrypts stored service secrets: openssl rand -hex 32. Never reuse NEXTAUTH_SECRET."),
  SETUP_TOKEN: text("Claims first-run setup instead of the code printed in the log. At least 16 characters: openssl rand -hex 16."),
  ALLOW_INSECURE_HTTP: text('"true" lets production run on plain http (LAN only). Cookies are then not Secure.'),
  // Infrastructure
  REDIS_URL: text("Redis for the job queue and rate limits. Rewind and Stripe need it."),
  TRUSTED_PROXY_HOPS: text("Reverse proxies that append to X-Forwarded-For (default 1)."),
  TZ: text("Server time zone (IANA name) until one is saved in Admin settings; otherwise UTC."),
  REWIND_CACHE_DIR: z
    .string()
    .default(".next/cache/rewind")
    .transform((dir) => path.resolve(dir))
    .describe("Rewind poster, card and font cache, resolved against the working directory."),
  ENABLE_QUEUE_WORKER: text('"false" turns the BullMQ worker off (default on with Redis).'),
  QUEUE_WORKER_CONCURRENCY: text("Jobs the worker runs at once (default 5)."),
  ENABLE_DISCORD_BOT: text('"false" stops this process from running the Discord bot (default on).'),
  DISCORD_BOT_POLL_INTERVAL_MS: text("How often to try for the bot lock and re-check settings (default 10000)."),
  ENABLE_WATCHLIST_SYNC: text('"false" turns the polling watchlist sync off when Redis is not set (default on).'),
  WATCHLIST_SYNC_POLL_INTERVAL_MS: text("How often the polling watchlist sync checks its lock (default 60000)."),
  LOG_LEVEL: text("error, warn, info, verbose, debug or silly (default info in production)."),
  METRICS_TOKEN: text("Bearer token for /api/metrics; without it the route answers 404: openssl rand -hex 32."),
  BUILD_COMMIT: text("Git commit /api/metrics reports in build_info (the image sets it at build time)."),
  SKIP_MIGRATIONS: text('Docker image only: "true" starts without applying migrations.'),
  PROCESS_ROLE: text("web, worker or all (default all): picks the database pool defaults."),
  DB_POOL_MAX: text("Database pool size (default 10 web, 5 worker, 12 all)."),
  DB_CONNECTION_TIMEOUT_MS: text("How long a query waits for a free database connection (default 10000)."),
  DB_STATEMENT_TIMEOUT_MS: text("Statement timeout in milliseconds (default 15000 web, 120000 worker, 60000 all)."),
  SHUTDOWN_GRACE_MS: text("How long SIGTERM waits for jobs, the bot and connections before exiting (default 8000)."),
  // Integrations
  DISCORD_BOT_TOKEN: text("Discord bot token, used when none is stored in Admin settings."),
  DISCORD_CLIENT_ID: text("Discord application id for the slash-command and metadata scripts."),
  NEXT_PUBLIC_DISCORD_CLIENT_ID: text("Discord application id the scripts fall back to."),
  DISCORD_GUILD_ID: text("Registers slash commands in one Discord server instead of globally."),
  DISCORD_SUPPORT_CHANNEL_ID: text("Support channel id, used when none is stored in Admin settings."),
  DISCORD_SUPPORT_THREAD_IDS: text("Comma-separated support thread ids, used when none are stored in Admin settings."),
  DISCORD_PORTAL_URL: text("Account-linking URL in Discord nudges (default <base>/discord/link)."),
  PLEX_WRAPPED_BASE_URL: text("First choice for the Discord portal base URL, before NEXT_PUBLIC_APP_URL."),
  JELLYFIN_DEVICE_ID: text("DeviceId reported to Jellyfin (default derived from PLEX_CLIENT_IDENTIFIER)."),
  LLM_REQUEST_TIMEOUT_MS: text("LLM request timeout in milliseconds (default 300000)."),
  REWIND_STAGING: text('Staging only: "1" lets a final-cut rehearsal run with an early --through (P8.5). Never set in production.'),
  // Test only, never in production
  E2E_TEST_MODE: text('Test only: "true" arms the seed outside production.'),
  E2E_DATABASE_URL: text("Test only: the Playwright database; its name must end in _test."),
  E2E_PORT: text("Test only: the Playwright web server port (default 3100)."),
  SKIP_CONNECTION_TESTS: text('Test only: "true" skips live Plex and Prometheus checks.'),
  ENABLE_DEV_UI: text('Development only: "1" serves the /dev/ui primitives sheet (Playwright sets it).'),
})

type Env = z.infer<typeof envSchema>

let cached: Env | undefined

/** The parsed environment, memoised outside Jest (whose tests change `process.env`). */
export function getEnv(): Env {
  if (cached) return cached
  const env = envSchema.parse(process.env)
  if (process.env.NODE_ENV !== "test") cached = env
  return env
}

const SECURE_SESSION_COOKIE = "__Secure-next-auth.session-token"
const SESSION_COOKIE = "next-auth.session-token"

function isHttps(url: string | undefined): boolean {
  return url?.startsWith("https:") ?? false
}

/** Secure cookies exactly where NextAuth inferred them before: an https `NEXTAUTH_URL`. */
export function usesSecureCookies(url = getEnv().NEXTAUTH_URL): boolean {
  return isHttps(url)
}

/**
 * The session cookie's name for `url`. `e2e/fixtures/session.ts` cannot import
 * this server-only module, so `__tests__/lib/auth-cookies.test.ts` checks that
 * the two agree.
 *
 * @internal
 */
export function sessionCookieName(url = getEnv().NEXTAUTH_URL): string {
  return isHttps(url) ? SECURE_SESSION_COOKIE : SESSION_COOKIE
}

/**
 * The app's base URL: `NEXT_PUBLIC_APP_URL`, then `NEXTAUTH_URL`, then
 * `http://localhost:3000` in development only.
 *
 * @throws Error outside development when neither is set
 */
export function getBaseUrl(): string {
  const { NEXT_PUBLIC_APP_URL, NEXTAUTH_URL } = getEnv()
  if (NEXT_PUBLIC_APP_URL) return NEXT_PUBLIC_APP_URL
  if (NEXTAUTH_URL) return NEXTAUTH_URL
  if (process.env.NODE_ENV === "development") return "http://localhost:3000"
  throw new Error(
    "Base URL is not configured. Please set NEXT_PUBLIC_APP_URL (or NEXTAUTH_URL) environment variable to your application URL (e.g., https://yourdomain.com)."
  )
}

/**
 * Secrets anyone can look up: `example.env`'s old value, the CI build string,
 * `jest.setup.js`'s and two common defaults.
 *
 * @internal
 */
export const KNOWN_PLACEHOLDER_SECRETS: ReadonlySet<string> = new Set([
  "your-secret-key-here-generate-with-openssl-rand-base64-32",
  "test-secret-for-ci-build-at-least-32-chars-long",
  "test-secret-key-for-hashing-ip-addresses-min-32-chars",
  "changeme",
  "secret",
])

/** The shortest `SETUP_TOKEN` that replaces the generated setup code (P11.32). */
export const SETUP_TOKEN_MIN_LENGTH = 16

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

/** @internal */
export interface EnvIssue {
  variable: string
  code: "missing" | "too_short" | "low_entropy" | "known_placeholder" | "not_https" | "origin_mismatch" | "schema_invalid"
  severity: "error" | "warning"
  hint: string
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

function checkSecret(secret: string | undefined): EnvIssue | null {
  const issue = (code: EnvIssue["code"], hint: string): EnvIssue => ({
    variable: "NEXTAUTH_SECRET",
    code,
    severity: "error",
    hint: `${hint}; generate one with openssl rand -base64 32`,
  })
  if (!secret) return issue("missing", "not set")
  if (KNOWN_PLACEHOLDER_SECRETS.has(secret)) return issue("known_placeholder", "known placeholder")
  if (secret.length < 32) return issue("too_short", "shorter than 32 characters")
  if (new Set(secret).size < 10) return issue("low_entropy", "fewer than 10 distinct characters")
  return null
}

function checkHttps(variable: string, url: string | undefined, allowInsecure: boolean): EnvIssue | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { variable, code: "not_https", severity: "error", hint: "not a valid URL" }
  }
  if (parsed.protocol === "https:" || LOOPBACK_HOSTS.has(parsed.hostname)) return null
  return allowInsecure
    ? { variable, code: "not_https", severity: "warning", hint: "plain http allowed by ALLOW_INSECURE_HTTP; cookies are not Secure" }
    : { variable, code: "not_https", severity: "error", hint: "must be https (or set ALLOW_INSECURE_HTTP=true on a LAN-only install)" }
}

/**
 * The production problems in `env`, as variable names and codes, never values.
 *
 * @example
 * ```ts
 * checkProductionEnv(envSchema.parse({ NEXTAUTH_SECRET: 'changeme', PLEX_CLIENT_IDENTIFIER: 'x' }))
 * // => [{ variable: 'NEXTAUTH_SECRET', code: 'known_placeholder', severity: 'error', hint: '...' }]
 * ```
 *
 * @internal
 */
export function checkProductionEnv(env: Env): EnvIssue[] {
  const allowInsecure = env.ALLOW_INSECURE_HTTP === "true"
  const issues = [
    checkSecret(env.NEXTAUTH_SECRET),
    checkHttps("NEXTAUTH_URL", env.NEXTAUTH_URL, allowInsecure),
    checkHttps("NEXT_PUBLIC_APP_URL", env.NEXT_PUBLIC_APP_URL, allowInsecure),
  ]
  if (env.SETUP_TOKEN !== undefined && env.SETUP_TOKEN.length < SETUP_TOKEN_MIN_LENGTH) {
    issues.push({ variable: "SETUP_TOKEN", code: "too_short", severity: "error", hint: "shorter than 16 characters; generate one with openssl rand -hex 16" })
  }
  if (!env.PLEX_CLIENT_IDENTIFIER?.trim()) {
    issues.push({ variable: "PLEX_CLIENT_IDENTIFIER", code: "missing", severity: "error", hint: "not set; generate one with openssl rand -hex 16" })
  }
  const schema = env.DATABASE_URL ? schemaParamOf(env.DATABASE_URL) : null
  if (schema !== null && !isValidSchemaName(schema)) {
    issues.push({
      variable: "DATABASE_URL",
      code: "schema_invalid",
      severity: "error",
      hint: "?schema= must be a letter or _ followed by up to 62 letters, digits or _",
    })
  }
  if (env.NEXTAUTH_URL && env.NEXT_PUBLIC_APP_URL && originOf(env.NEXTAUTH_URL) !== originOf(env.NEXT_PUBLIC_APP_URL)) {
    issues.push({ variable: "NEXT_PUBLIC_APP_URL", code: "origin_mismatch", severity: "warning", hint: "has a different origin from NEXTAUTH_URL" })
  }
  return issues.filter((issue): issue is EnvIssue => issue !== null)
}

/**
 * Exits the process when a production server would start with an unsafe
 * environment. Does nothing outside production and during `next build`.
 */
export function assertBootEnv(): void {
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return
  const logger = createLogger("ENV")
  const issues = checkProductionEnv(getEnv())
  for (const issue of issues) {
    const message = `${issue.severity === "error" ? "env.invalid" : "env.warning"} ${issue.variable}: ${issue.hint}`
    const metadata = { variable: issue.variable, code: issue.code }
    if (issue.severity === "error") logger.error(message, undefined, metadata)
    else logger.warn(message, metadata)
  }
  if (issues.some((issue) => issue.severity === "error")) process.exit(1)
}
