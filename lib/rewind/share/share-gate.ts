/**
 * What proxy.ts does for `/rewind/s/<token>` before the share page renders
 * (P0.11, P7.5). The page cannot set its own status: `app/loading.tsx`
 * streams every page, so a 404 from `notFound()` goes out as 200, and a
 * page can never answer 429 or 503. In order:
 *
 * 1. A segment that cannot be a token (not valid percent-encoding, or not 43
 *    base64url characters) is `missing`, with no limit point and no read.
 * 2. The visitor spends a point of `rw:share-page` (60 a minute per client
 *    IP). Over the limit they get `busy` (429), and nothing below runs for
 *    them: no probe, no lookup, no metadata, no page.
 * 3. A database probe, a one-row read within 2 s whose result is kept for
 *    5 s, answers `down` (503 with `Retry-After: 30`) when it fails.
 * 4. The token is looked up with the rule of `getShareSafeRewind`
 *    (`shareTokenKind`): `missing` (404) when it shares nothing, else `shown`.
 *
 * A limiter that throws lets the request on to the probe, and a lookup that
 * throws lets it through to the page, whose own lookup renders the Rewind or
 * reaches `error.tsx`.
 *
 * @module lib/rewind/share/share-gate
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { clientIp } from "@/lib/security/client-ip"
import { consume } from "@/lib/security/rate-limit"
import { createLogger } from "@/lib/utils/logger"
import { shareTokenSchema } from "@/lib/validations/params"
import { shareTokenKind } from "@/lib/wrapped/data/share-token"

const logger = createLogger("REWIND_SHARE_GATE")

/** `/rewind/s/<token>`, where next.config.js sends the old `/wrapped/share/<token>` (P5.1). */
const SHARE_PATH = /^\/rewind\/s\/([^/]+)$/

const PROBE_TIMEOUT_MS = 2000
const PROBE_TTL_MS = 5000

export type ShareGate = "missing" | "busy" | "down" | "shown"

let probe: { ok: boolean; at: number } | null = null

/** Forgets the cached probe result. @internal For tests. */
export function resetShareProbe(): void {
  probe = null
}

/** Whether the database answers a one-row read within 2 s; the answer is kept for 5 s. */
async function databaseUp(now: number): Promise<boolean> {
  if (probe && now - probe.at < PROBE_TTL_MS) return probe.ok
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS)
  })
  const read = (async () => {
    await prisma.config.findUnique({ where: { id: "config" }, select: { id: true } })
    return true
  })().catch((error: unknown) => {
    logger.error("Share page database probe failed", error)
    return false
  })
  try {
    const ok = await Promise.race([read, timeout])
    probe = { ok, at: now }
    return ok
  } finally {
    clearTimeout(timer)
  }
}

/** The gate for `pathname`, or null when it is not a share path. */
export async function gateSharePath(pathname: string, headers: Headers): Promise<ShareGate | null> {
  const segment = SHARE_PATH.exec(pathname)?.[1]
  if (segment === undefined) return null

  let token: string
  try {
    token = decodeURIComponent(segment)
  } catch {
    return "missing"
  }
  if (!shareTokenSchema.safeParse(token).success) return "missing"

  try {
    if (!(await consume("rw:share-page", clientIp(headers))).ok) return "busy"
  } catch (error) {
    logger.error("Share page rate limit failed", error)
  }

  if (!(await databaseUp(Date.now()))) return "down"

  try {
    return (await shareTokenKind(token)) ? "shown" : "missing"
  } catch (error) {
    logger.error("Share token lookup failed", error)
    return "shown"
  }
}
