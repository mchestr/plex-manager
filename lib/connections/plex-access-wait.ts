/**
 * The access check right after an invite was redeemed. plex.tv takes a few
 * seconds to propagate a new share, so the check waits 3 s and then retries up
 * to five times with doubling delays (2, 4, 8, 16 and 32 s), never past three
 * minutes in total. The schedule is fixed here on the server (SEC-19).
 * An `unknown` check is retried like a denial.
 *
 * @module lib/connections/plex-access-wait
 */

import "server-only"

import { checkUserServerAccess } from "@/lib/connections/plex"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("PLEX_ACCESS_WAIT")

const INITIAL_DELAY_MS = 3000
const FIRST_RETRY_DELAY_MS = 2000
const MAX_RETRIES = 5
const MAX_WAIT_MS = 3 * 60 * 1000

type ServerConfig = Parameters<typeof checkUserServerAccess>[0]
type AccessCheck = Awaited<ReturnType<typeof checkUserServerAccess>>

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Checks a freshly invited member's access with the schedule above. Returns
 * the first check that grants access, or the last one. Running out of time is
 * `unknown`, never a clean "no access".
 */
export async function waitForInvitedAccess(serverConfig: ServerConfig, plexUserId: string): Promise<AccessCheck> {
  const started = Date.now()
  await wait(INITIAL_DELAY_MS)

  let check = await checkUserServerAccess(serverConfig, plexUserId)
  let delay = FIRST_RETRY_DELAY_MS
  for (let retry = 1; retry <= MAX_RETRIES && check.status !== "granted"; retry++) {
    const remaining = MAX_WAIT_MS - (Date.now() - started)
    if (remaining <= 0) {
      logger.warn("Invited member's access check timed out", { retry })
      return { status: "unknown", reason: "plex_unavailable" }
    }
    await wait(Math.min(delay, remaining))
    check = await checkUserServerAccess(serverConfig, plexUserId)
    delay *= 2
  }

  logger.info("Invited member's access check finished", {
    status: check.status,
    durationMs: Date.now() - started,
  })
  return check
}
