/**
 * Explicit pg pool limits per process role (BP-18).
 *
 * `PROCESS_ROLE` is `web`, `worker` or `all` (the default until a separate
 * worker process exists). `DB_POOL_MAX`, `DB_CONNECTION_TIMEOUT_MS` and
 * `DB_STATEMENT_TIMEOUT_MS` override the role's defaults. The Prisma 7 pg
 * adapter ignores `?connection_limit=` and `pool_timeout` in `DATABASE_URL`.
 *
 * Reads `process.env` directly rather than `lib/env.ts`, because `lib/prisma.ts`
 * is also loaded by scripts outside Next, where `server-only` throws.
 *
 * @example
 * ```ts
 * poolConfigFor("web")
 * // => { max: 10, statement_timeout: 15000, connectionTimeoutMillis: 10000,
 * //      idleTimeoutMillis: 30000, application_name: "plex-manager-web" }
 * ```
 */

type ProcessRole = "web" | "worker" | "all"

/** The pg `PoolConfig` fields this module sets, spread into `new PrismaPg({...})`. */
interface PoolLimits {
  max: number
  connectionTimeoutMillis: number
  statement_timeout: number
  idleTimeoutMillis: number
  application_name: string
}

const ROLE_DEFAULTS: Record<ProcessRole, { max: number; statementTimeoutMs: number }> = {
  web: { max: 10, statementTimeoutMs: 15_000 },
  worker: { max: 5, statementTimeoutMs: 120_000 },
  all: { max: 12, statementTimeoutMs: 60_000 },
}

function isRole(value: string | undefined): value is ProcessRole {
  return value === "web" || value === "worker" || value === "all"
}

/** The role from `PROCESS_ROLE`, `all` when unset or unknown. */
export function processRole(): ProcessRole {
  const role = process.env.PROCESS_ROLE
  return isRole(role) ? role : "all"
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function poolConfigFor(role: ProcessRole): PoolLimits {
  const defaults = ROLE_DEFAULTS[role]
  return {
    max: positiveInt(process.env.DB_POOL_MAX, defaults.max),
    connectionTimeoutMillis: positiveInt(process.env.DB_CONNECTION_TIMEOUT_MS, 10_000),
    statement_timeout: positiveInt(process.env.DB_STATEMENT_TIMEOUT_MS, defaults.statementTimeoutMs),
    idleTimeoutMillis: 30_000,
    application_name: `plex-manager-${role}`,
  }
}
