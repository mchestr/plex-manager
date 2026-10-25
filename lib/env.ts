import "server-only"

import path from "node:path"
import { z } from "zod"

import { isValidSchemaName, schemaParamOf } from "@/lib/db/schema-param"
import { parseKeyringEntries } from "@/lib/security/crypto"
import { createLogger } from "@/lib/utils/logger"

/**
 * Every environment variable the app reads, with the boot-time production check.
 *
 * The schema never throws: every field is optional or defaulted, so `next build`
 * (whose Docker builder sets only a placeholder `DATABASE_URL`) and Jest can
 * import it. Production refuses to start through {@link assertBootEnv} instead.
 * `__tests__/config/env-coverage.test.ts` fails when code reads a variable this
 * schema and `example.env` do not describe. Each field's `.meta()` is what
 * `npm run env:docs` writes to `docs/environment.md` and `example.env`.
 *
 * @module
 */

/**
 * The groups `docs/environment.md` and `example.env` list the variables under,
 * in order (`npm run env:docs`, scripts/gen-env-reference.ts).
 */
export const ENV_GROUPS = [
  "Core",
  "Database",
  "Background work",
  "Observability",
  "Data retention",
  "Integrations",
  "Rewind",
  "Test only",
] as const

/** What the environment reference prints for a variable, kept as Zod metadata. */
export interface EnvDoc {
  group: (typeof ENV_GROUPS)[number]
  /** The value used when the variable is unset. */
  default?: string
  /** example.env sets it, uncommented, to this development value. */
  example?: string
  /** `checkProductionEnv` refuses to start without it (a test keeps the two equal). */
  requiredInProduction?: true
  /** Needed to run, though the boot check does not test it. */
  required?: true
}

const text = (description: string, doc: EnvDoc) => z.string().optional().meta({ description, ...doc })

/** Every variable, with the metadata `npm run env:docs` renders. */
export const envSchema = z.object({
  DATABASE_URL: text("PostgreSQL connection string. ?schema= picks the Postgres schema for migrations and the app alike; change it only before the first migration.", {
    group: "Database",
    required: true,
    example: "postgresql://postgres:your-postgres-password@localhost:5432/plex_wrapped?schema=public",
  }),
  NEXTAUTH_URL: text("The app's URL, for NextAuth callbacks and session cookies. https in production; cookies are Secure exactly when it is https.", {
    group: "Core",
    required: true,
    example: "http://localhost:3000",
  }),
  NEXT_PUBLIC_APP_URL: text("Public URL for share links and OG images; same origin as NEXTAUTH_URL. A bare-metal install rebuilds after changing it, because Next inlines it at build time.", {
    group: "Core",
    default: "NEXTAUTH_URL",
    example: "http://localhost:3000",
  }),
  NEXTAUTH_SECRET: text("Signs session cookies. At least 32 random characters: openssl rand -base64 32.", {
    group: "Core",
    requiredInProduction: true,
    example: "",
  }),
  PLEX_CLIENT_IDENTIFIER: text("Unique id this install reports to Plex: openssl rand -hex 16. Keep it stable; Jellyfin's default device id is derived from it.", {
    group: "Core",
    requiredInProduction: true,
    example: "",
  }),
  ENCRYPTION_KEYS: text("Keyring for secrets stored at rest: comma-separated kid:base64 entries of 32 bytes each (openssl rand -base64 32). The first encrypts new writes; the others only read. Production also starts with ENCRYPTION_KEY alone, or with ALLOW_PLAINTEXT_SECRETS=true. Keep every key in a password manager, never beside a database dump; rotation and lost-key recovery are in docs/operations.md.", {
    group: "Core",
    requiredInProduction: true,
  }),
  ENCRYPTION_KEY: text("Older single key for stored secrets, at least 32 characters: openssl rand -hex 32. Never reuse NEXTAUTH_SECRET. It still reads what it wrote and, without ENCRYPTION_KEYS, encrypts new writes as kid legacy; move to ENCRYPTION_KEYS with Settings > Security.", {
    group: "Core",
  }),
  ALLOW_PLAINTEXT_SECRETS: text('UNSAFE. "true" lets production start without a strong encryption key; every boot warns and secrets are stored as plain text.', {
    group: "Core",
    default: "false",
  }),
  SETUP_TOKEN: text("Claims first-run setup instead of the code printed in the log. At least 16 characters: openssl rand -hex 16.", {
    group: "Core",
  }),
  ALLOW_INSECURE_HTTP: text('"true" lets production run on plain http (LAN only). Cookies are then not Secure; never set it on an install reachable from the internet.', {
    group: "Core",
    default: "false",
  }),
  REDIS_URL: text("Redis for the job queue and rate limits, redis://:password@host:6379. Rewind and Stripe need it.", {
    group: "Background work",
  }),
  TRUSTED_PROXY_HOPS: text("Reverse proxies that append to X-Forwarded-For: 1 for one proxy, 2 for a CDN in front of it, 0 for none. A wrong value lets clients pick their rate-limit address.", {
    group: "Core",
    default: "1",
  }),
  TZ: text("Server time zone (IANA name) until one is saved in Admin settings, which overrides it.", {
    group: "Core",
    default: "UTC",
  }),
  REWIND_CACHE_DIR: z
    .string()
    .default(".next/cache/rewind")
    .transform((dir) => path.resolve(dir))
    .meta({
      description: "Rewind poster, card and font cache, resolved against the working directory. It can be rebuilt, so it needs no backup.",
      group: "Rewind",
      default: ".next/cache/rewind",
    } satisfies EnvDoc & { description: string }),
  ENABLE_QUEUE_WORKER: text('"false" turns the BullMQ worker off in this process (on by default when REDIS_URL is set).', {
    group: "Background work",
    default: "true",
  }),
  QUEUE_WORKER_CONCURRENCY: text("Jobs the worker runs at once.", { group: "Background work", default: "5" }),
  ENABLE_DISCORD_BOT: text('"false" opts this process out of the Discord bot. Otherwise it starts once Admin, Discord, "Bot enabled" is on and a token exists, with no restart. One process runs it, under a database lock.', {
    group: "Background work",
    default: "true",
  }),
  DISCORD_BOT_POLL_INTERVAL_MS: text("How often to try for the bot lock and re-check settings.", {
    group: "Background work",
    default: "10000",
  }),
  ENABLE_WATCHLIST_SYNC: text('"false" turns the polling watchlist sync off when Redis is not set.', {
    group: "Background work",
    default: "true",
  }),
  WATCHLIST_SYNC_POLL_INTERVAL_MS: text("How often the polling watchlist sync checks its lock.", {
    group: "Background work",
    default: "60000",
  }),
  LOG_LEVEL: text("error, warn, info, verbose, debug or silly.", {
    group: "Observability",
    default: "info in production, else debug",
  }),
  METRICS_TOKEN: text("Bearer token for /api/metrics; without it the route answers 404: openssl rand -hex 32.", {
    group: "Observability",
  }),
  BUILD_COMMIT: text("Git commit /api/metrics reports in build_info (the image sets it at build time).", {
    group: "Observability",
  }),
  SKIP_MIGRATIONS: text('Docker image only: "true" starts without applying migrations; the entrypoint still logs prisma migrate status.', {
    group: "Database",
    default: "false",
  }),
  PROCESS_ROLE: text("web, worker or all: what this container runs, and the database pool defaults below. web serves pages only; worker runs the queues, schedulers and Discord bot and serves only /api/health and /api/metrics; all does both in one container (docs/examples/docker-compose.workers.yml). The boot check refuses any other value.", {
    group: "Database",
    default: "all",
  }),
  DB_POOL_MAX: text("Database pool size. The Prisma 7 pg adapter ignores ?connection_limit= in DATABASE_URL.", {
    group: "Database",
    default: "10 web, 5 worker, 12 all",
  }),
  DB_CONNECTION_TIMEOUT_MS: text("How long a query waits for a free database connection.", {
    group: "Database",
    default: "10000",
  }),
  DB_STATEMENT_TIMEOUT_MS: text("Statement timeout in milliseconds.", {
    group: "Database",
    default: "15000 web, 120000 worker, 60000 all",
  }),
  SHUTDOWN_GRACE_MS: text("How long SIGTERM waits for jobs, the bot and connections before exiting (below Docker's 10 s stop timeout).", {
    group: "Background work",
    default: "8000",
  }),
  // Retention windows in days (P11.14, docs/privacy.md); each at least 1
  RETENTION_REWIND_LLM_TEXT_DAYS: text("Days Rewind AI prompts and replies keep their text.", { group: "Data retention", default: "120" }),
  RETENTION_ASSISTANT_LLM_TEXT_DAYS: text("Days assistant prompts and replies keep their text.", { group: "Data retention", default: "90" }),
  RETENTION_CHAT_CONVERSATION_DAYS: text("Days an ended assistant conversation is kept.", { group: "Data retention", default: "180" }),
  RETENTION_DISCORD_CHAT_MESSAGES_DAYS: text("Idle days before a Discord chat's stored turns are emptied.", { group: "Data retention", default: "1" }),
  RETENTION_DISCORD_CHAT_SESSION_DAYS: text("Idle days before a Discord chat session is deleted.", { group: "Data retention", default: "30" }),
  RETENTION_DISCORD_COMMAND_ARGS_DAYS: text("Days Discord command arguments are kept.", { group: "Data retention", default: "7" }),
  RETENTION_DISCORD_COMMAND_LOG_DAYS: text("Days Discord command log rows are kept.", { group: "Data retention", default: "90" }),
  RETENTION_SHARE_VISITS_DAYS: text("Days Rewind share-link daily visit counts are kept.", { group: "Data retention", default: "90" }),
  RETENTION_REWIND_VIEW_DAYS: text("Days Rewind reading records are kept.", { group: "Data retention", default: "120" }),
  RETENTION_WATCHLIST_REMOVED_DAYS: text("Days a title removed from a watchlist stays in sync history.", { group: "Data retention", default: "30" }),
  RETENTION_DISCORD_OAUTH_STATE_DAYS: text("Days an expired Discord link attempt is kept.", { group: "Data retention", default: "1" }),
  RETENTION_AUDIT_LOG_DAYS: text("Days audit log rows are kept.", { group: "Data retention", default: "400" }),
  DISCORD_BOT_TOKEN: text("Discord bot token, used when none is stored in Admin settings.", { group: "Integrations" }),
  DISCORD_CLIENT_ID: text("Discord application id for the slash-command and metadata scripts.", { group: "Integrations" }),
  NEXT_PUBLIC_DISCORD_CLIENT_ID: text("Discord application id the scripts fall back to.", { group: "Integrations" }),
  DISCORD_GUILD_ID: text("Registers slash commands in one Discord server, instantly, instead of globally.", { group: "Integrations" }),
  DISCORD_SUPPORT_CHANNEL_ID: text("Support channel id, used when none is stored in Admin settings.", { group: "Integrations" }),
  DISCORD_SUPPORT_THREAD_IDS: text("Comma-separated support thread ids, used when none are stored in Admin settings.", { group: "Integrations" }),
  DISCORD_PORTAL_URL: text("Account-linking URL in Discord nudges.", { group: "Integrations", default: "<base>/discord/link" }),
  PLEX_WRAPPED_BASE_URL: text("First choice for the Discord portal base URL, before NEXT_PUBLIC_APP_URL and NEXTAUTH_URL.", { group: "Integrations" }),
  JELLYFIN_DEVICE_ID: text("DeviceId reported to Jellyfin at sign-in. Leave unset: the default is derived from PLEX_CLIENT_IDENTIFIER.", {
    group: "Integrations",
    default: "plex-manager-<16 hex characters>",
  }),
  LLM_REQUEST_TIMEOUT_MS: text("LLM request timeout in milliseconds.", { group: "Integrations", default: "300000" }),
  REWIND_STAGING: text('Staging only: "1" lets a final-cut rehearsal run with an early --through (P8.5). Never set in production.', {
    group: "Rewind",
  }),
  E2E_TEST_MODE: text('Test only: "true" arms the seed outside production. Never set it in .env; pass it inline.', { group: "Test only" }),
  E2E_DATABASE_URL: text("Test only: the Playwright database; its name must end in _test, and the suite wipes it.", {
    group: "Test only",
    example: "postgresql://postgres:your-postgres-password@localhost:5433/plex_manager_test?schema=public",
  }),
  E2E_PORT: text("Test only: the Playwright web server port.", { group: "Test only", default: "3100" }),
  SKIP_CONNECTION_TESTS: text('Test only: "true" skips live Plex and Prometheus checks.', { group: "Test only" }),
  ENABLE_DEV_UI: text('Development only: "1" serves the /dev/ui primitives sheet (Playwright sets it).', { group: "Test only" }),
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
  code: "missing" | "too_short" | "low_entropy" | "known_placeholder" | "not_https" | "origin_mismatch" | "schema_invalid" | "weak" | "invalid"
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

const KEY_HINT = "generate one with openssl rand -base64 32 for ENCRYPTION_KEYS (kid:base64), or set ALLOW_PLAINTEXT_SECRETS=true"

/**
 * At-rest encryption on by default (P11.1, SEC-33): no key at all is
 * `missing`, and a keyring entry that is not 32 bytes or a legacy key shorter
 * than 32 characters or equal to `NEXTAUTH_SECRET` is `weak`. Both are errors
 * unless `ALLOW_PLAINTEXT_SECRETS=true`, which makes them warnings.
 */
function checkEncryptionKeys(env: Env): EnvIssue[] {
  const severity = env.ALLOW_PLAINTEXT_SECRETS === "true" ? "warning" : "error"
  const ring = env.ENCRYPTION_KEYS?.trim() ? env.ENCRYPTION_KEYS : undefined
  const legacy = env.ENCRYPTION_KEY || undefined
  if (!ring && !legacy) {
    return [{ variable: "ENCRYPTION_KEY", code: "missing", severity, hint: `neither ENCRYPTION_KEYS nor ENCRYPTION_KEY is set; ${KEY_HINT}` }]
  }
  const issues: EnvIssue[] = []
  const bad = parseKeyringEntries(ring).filter((entry) => entry.problem !== null)
  if (bad.length > 0) {
    const named = bad.map((entry) => `${entry.kid || "?"} (${entry.problem})`).join(", ")
    issues.push({ variable: "ENCRYPTION_KEYS", code: "weak", severity, hint: `unusable entries: ${named}; ${KEY_HINT}` })
  }
  if (legacy && (legacy.length < 32 || legacy === env.NEXTAUTH_SECRET)) {
    const why = legacy === env.NEXTAUTH_SECRET ? "equals NEXTAUTH_SECRET" : "shorter than 32 characters"
    issues.push({ variable: "ENCRYPTION_KEY", code: "weak", severity, hint: `${why}; ${KEY_HINT}` })
  }
  return issues
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
 * // => [
 * //   { variable: 'NEXTAUTH_SECRET', code: 'known_placeholder', severity: 'error', hint: '...' },
 * //   { variable: 'ENCRYPTION_KEY', code: 'missing', severity: 'error', hint: '...' },
 * // ]
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
  issues.push(...checkEncryptionKeys(env))
  if (env.SETUP_TOKEN !== undefined && env.SETUP_TOKEN.length < SETUP_TOKEN_MIN_LENGTH) {
    issues.push({ variable: "SETUP_TOKEN", code: "too_short", severity: "error", hint: "shorter than 16 characters; generate one with openssl rand -hex 16" })
  }
  // An unknown role would fall back to `all` and run the queues where only pages were meant (P11.3)
  if (env.PROCESS_ROLE !== undefined && !["web", "worker", "all"].includes(env.PROCESS_ROLE)) {
    issues.push({ variable: "PROCESS_ROLE", code: "invalid", severity: "error", hint: "must be web, worker or all" })
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
