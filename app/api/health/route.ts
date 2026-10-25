import { NextRequest, NextResponse } from "next/server"

import { processRole } from "@/lib/db/pool-config"
import { checkDependencies } from "@/lib/health/checks"
import { withRequestContext } from "@/lib/actions/route"

/**
 * Health check for the image's HEALTHCHECK and for monitoring (BP-16, BP-17).
 *
 * - `?probe=live` answers 200 without touching any dependency. The Docker
 *   HEALTHCHECK uses it, so a Redis outage, which the site survives (P4.2),
 *   never gets the container marked unhealthy and restarted.
 * - Without it, the database and Redis are checked, each within 2 s
 *   (`lib/health/checks.ts`): 200 when every configured check passes,
 *   otherwise 503. Redis reports `not_configured` when `REDIS_URL` is unset,
 *   which does not fail the check.
 *
 * Both bodies name the container's `PROCESS_ROLE` (`web`, `worker` or `all`,
 * P11.3). The body is anonymous: it carries no hostnames and no error text.
 */

const NO_STORE = { "Cache-Control": "no-store" }

async function handleGet(request: NextRequest) {
  if (request.nextUrl.searchParams.get("probe") === "live") {
    return NextResponse.json({ status: "ok", role: processRole() }, { headers: NO_STORE })
  }

  const { database, redis } = await checkDependencies()
  const healthy = database !== "fail" && redis !== "fail"

  return NextResponse.json(
    { status: healthy ? "ok" : "fail", role: processRole(), checks: { database, redis } },
    { status: healthy ? 200 : 503, headers: NO_STORE }
  )
}

export const GET = withRequestContext(handleGet)
