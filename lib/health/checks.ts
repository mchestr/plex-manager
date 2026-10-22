/**
 * The database and Redis checks behind `/api/health` (P4.17), shared with the
 * admin Overview (P10.8). Each check answers within 2 s; a failure is logged
 * here and reported as `fail`, never with its error text.
 *
 * @module lib/health/checks
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { getRequestPathRedis, isRedisConfigured, readyWithin } from "@/lib/queue/connection"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("HEALTH")

const CHECK_TIMEOUT_MS = 2000

export type CheckStatus = "ok" | "fail" | "not_configured"

export interface DependencyChecks {
  database: CheckStatus
  /** `not_configured` when `REDIS_URL` is unset. */
  redis: CheckStatus
}

/**
 * Runs `probe`, answering `fail` when it throws or takes longer than
 * {@link CHECK_TIMEOUT_MS}. A probe that fails after its timeout is not logged
 * a second time.
 */
async function runCheck(name: string, probe: () => Promise<void>): Promise<CheckStatus> {
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<CheckStatus>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true
      logger.warn("Health check timed out", { check: name, timeoutMs: CHECK_TIMEOUT_MS })
      resolve("fail")
    }, CHECK_TIMEOUT_MS)
  })
  const result = probe().then(
    (): CheckStatus => "ok",
    (error: unknown): CheckStatus => {
      if (!timedOut) logger.warn("Health check failed", { check: name, error })
      return "fail"
    }
  )
  try {
    return await Promise.race([result, timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function checkDatabase(): Promise<void> {
  await prisma.config.findUnique({ where: { id: "config" }, select: { id: true } })
}

async function checkRedis(): Promise<void> {
  const client = getRequestPathRedis()
  // The fail-fast client refuses commands until it is connected.
  if (!(await readyWithin(client, CHECK_TIMEOUT_MS))) {
    throw new Error("Redis not ready")
  }
  await client.ping()
}

/** The database and Redis, checked in parallel. */
export async function checkDependencies(): Promise<DependencyChecks> {
  const [database, redis] = await Promise.all([
    runCheck("database", checkDatabase),
    isRedisConfigured() ? runCheck("redis", checkRedis) : Promise.resolve<CheckStatus>("not_configured"),
  ])
  return { database, redis }
}
