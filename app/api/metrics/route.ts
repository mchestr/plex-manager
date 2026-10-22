import { createHash, timingSafeEqual } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import { withRequestContext } from "@/lib/actions/route"
import { getEnv } from "@/lib/env"
import { collectMetrics } from "@/lib/observability/metrics"
import { PROMETHEUS_CONTENT_TYPE } from "@/lib/observability/prometheus-text"

/**
 * Prometheus metrics (BP-17, P11.4): queue depth, job failures, LLM spend and
 * the process (`lib/observability/metrics.ts`).
 *
 * - Without `METRICS_TOKEN` the route does not exist: 404.
 * - Otherwise it needs `Authorization: Bearer <METRICS_TOKEN>`, compared in
 *   constant time; anything else is a 401.
 * - A source that fails still gives a 200, with `plex_manager_scrape_error`.
 */
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const NO_STORE = { "Cache-Control": "no-store" }

/** Equal-length digests, so the comparison takes the same time whatever was sent. */
function tokenMatches(sent: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest()
  return timingSafeEqual(digest(sent), digest(expected))
}

async function handleGet(request: NextRequest) {
  const token = getEnv().METRICS_TOKEN
  if (!token) return new NextResponse(null, { status: 404, headers: NO_STORE })

  const header = request.headers.get("authorization") ?? ""
  const sent = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : ""
  if (!tokenMatches(sent, token)) {
    return new NextResponse(null, { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": "Bearer" } })
  }

  return new NextResponse(await collectMetrics(), {
    headers: { ...NO_STORE, "Content-Type": PROMETHEUS_CONTENT_TYPE },
  })
}

export const GET = withRequestContext(handleGet)
