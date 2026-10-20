import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getRequestPathRedis, isRedisConfigured, readyWithin } from "@/lib/queue/connection"
import { createLogger } from "@/lib/utils/logger"

/**
 * Health check for the image's HEALTHCHECK and for monitoring (BP-16, BP-17).
 *
 * - `?probe=live` answers 200 without touching any dependency. The Docker
 *   HEALTHCHECK uses it, so a Redis outage, which the site survives (P4.2),
 *   never gets the container marked unhealthy and restarted.
 * - Without it, the database and Redis are checked, each within 2 s: 200 when
 *   every configured check passes, otherwise 503. Redis reports
 *   `not_configured` when `REDIS_URL` is unset, which does not fail the check.
 *
 * The body is anonymous: it carries no hostnames and no error text.
 */
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const logger = createLogger("HEALTH")

const CHECK_TIMEOUT_MS = 2000

type CheckStatus = "ok" | "fail" | "not_configured"

const NO_STORE = { "Cache-Control": "no-store" }

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

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("probe") === "live") {
    return NextResponse.json({ status: "ok" }, { headers: NO_STORE })
  }

  const [database, redis] = await Promise.all([
    runCheck("database", checkDatabase),
    isRedisConfigured() ? runCheck("redis", checkRedis) : Promise.resolve<CheckStatus>("not_configured"),
  ])
  const healthy = database !== "fail" && redis !== "fail"

  return NextResponse.json(
    { status: healthy ? "ok" : "fail", checks: { database, redis } },
    { status: healthy ? 200 : 503, headers: NO_STORE }
  )
}
