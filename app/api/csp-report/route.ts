import { NextResponse } from "next/server"

import { withRequestContext } from "@/lib/actions/route"
import { cspReportType, parseCspReport } from "@/lib/security/csp-report"
import { limitRequest } from "@/lib/security/rate-limit"
import { createLogger } from "@/lib/utils/logger"

/**
 * Content Security Policy violation reports (P11.20): the policy's
 * `report-uri` and its `report-to csp` endpoint (`lib/security/csp.ts`).
 *
 * Anonymous by design, since browsers send reports without credentials, so it
 * is rate-limited per address (`csp-report`), reads at most 8 KB and stores
 * nothing: each violation is one `csp.violation` warning with the directive,
 * the blocked origin and the masked document path
 * (`lib/security/csp-report.ts`). Accepted reports get 204.
 */

const logger = createLogger("CSP")

/** The largest report body read. */
const MAX_REPORT_BYTES = 8 * 1024

/** The body as text, or `null` once it passes `limit` bytes. */
async function readCapped(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > limit) return null
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString("utf8")
}

async function handlePost(request: Request) {
  const limited = await limitRequest("csp-report", request)
  if (limited) return limited

  const type = cspReportType(request.headers.get("content-type"))
  if (!type) return new NextResponse(null, { status: 415 })

  const body = await readCapped(request, MAX_REPORT_BYTES)
  if (body === null) return new NextResponse(null, { status: 413 })

  const violations = parseCspReport(type, body)
  if (!violations) return new NextResponse(null, { status: 400 })

  for (const violation of violations) {
    logger.warn("csp.violation", { ...violation })
  }
  return new NextResponse(null, { status: 204 })
}

export const POST = withRequestContext(handlePost)
