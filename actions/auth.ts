"use server"

import { z } from "zod"

import { publicAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { checkUserServerAccess, getPlexUserInfo, type PlexUserInfo } from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("AUTH_ACTION")

// Constants
const DEFAULT_RETRY_DELAY_MS = 2000
const EXPONENTIAL_BACKOFF_MULTIPLIER = 2
const MAX_RETRY_TIMEOUT_MS = 3 * 60 * 1000 // 3 minutes

/**
 * The invite flow's retries, fixed on the server (SEC-19): Plex needs a few
 * seconds to propagate a new share, so the first check waits 3 s and five
 * retries follow with backoff. A caller cannot ask for longer waits.
 */
const INVITE_FLOW_MAX_RETRIES = 5
const INVITE_FLOW_INITIAL_DELAY_MS = 3000

const ACCESS_CHECK_FAILED = "We couldn't check your access to the server. Please try again."

/** The Plex token (as plex.tv issues it) and whether this is an invite redemption; nothing else. */
const checkServerAccessSchema = z.strictObject({
  token: z.string().min(10).max(200),
  isInviteFlow: z.boolean(),
})

// Types
interface ServerAccessResult {
  success: boolean
  hasAccess: boolean
  error?: string
}

interface PlexServerConfig {
  url: string
  token: string
  adminPlexUserId: string | null
}

/**
 * Wait for a specified delay
 */
function waitForDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Get active Plex server configuration
 */
async function getActivePlexServer(): Promise<{ success: boolean; data?: PlexServerConfig; error?: string }> {
  const plexServer = await prisma.plexServer.findFirst({
    where: { isActive: true },
  })

  if (!plexServer) {
    return { success: false, error: "No Plex server configured" }
  }

  return {
    success: true,
    data: {
      url: plexServer.url,
      token: plexServer.token,
      adminPlexUserId: plexServer.adminPlexUserId,
    },
  }
}

/**
 * Fetch Plex user information from token
 */
async function fetchPlexUser(userToken: string): Promise<{ success: boolean; data?: PlexUserInfo; error?: string }> {
  const userInfoResult = await getPlexUserInfo(userToken)

  if (!userInfoResult.success || !userInfoResult.data) {
    return {
      success: false,
      error: userInfoResult.error || "Failed to fetch user information",
    }
  }

  return { success: true, data: userInfoResult.data }
}

/**
 * Perform a single access check for a user against a server
 */
async function performAccessCheck(
  serverConfig: PlexServerConfig,
  plexUserId: string
): Promise<ServerAccessResult> {
  const startTime = Date.now()
  logger.debug("Starting access check", { plexUserId })

  const result = await checkUserServerAccess(serverConfig, plexUserId)

  const duration = Date.now() - startTime
  logger.debug("Access check completed", { duration, hasAccess: result.hasAccess, success: result.success })

  return result
}

/**
 * Retry access check with exponential backoff
 * Note: The initial delay should already be applied before calling this function.
 * The firstRetryDelay parameter is used for the first retry attempt, not the initial delay.
 * Will stop retrying after MAX_RETRY_TIMEOUT_MS (3 minutes) even if retries remain
 */
async function retryAccessCheckWithBackoff(
  serverConfig: PlexServerConfig,
  plexUserId: string,
  maxRetries: number,
  firstRetryDelay: number
): Promise<ServerAccessResult> {
  const retryStartTime = Date.now()
  logger.debug("Starting retry logic", {
    maxRetries,
    firstRetryDelay,
    maxTimeout: MAX_RETRY_TIMEOUT_MS,
  })

  // Perform initial check after the initial delay has already been applied
  let accessCheck = await performAccessCheck(serverConfig, plexUserId)

  // If access is granted, return immediately
  if (accessCheck.hasAccess) {
    const totalDuration = Date.now() - retryStartTime
    logger.info("Access granted on initial check", { duration: totalDuration })
    return accessCheck
  }

  // Retry with exponential backoff
  // Use firstRetryDelay for the first retry attempt (not initialDelay, which was already applied)
  let retryCount = 0
  let delay = firstRetryDelay

  while (retryCount < maxRetries && !accessCheck.hasAccess) {
    // Check if we've exceeded the maximum timeout
    const elapsedTime = Date.now() - retryStartTime
    if (elapsedTime >= MAX_RETRY_TIMEOUT_MS) {
      const totalDuration = Date.now() - retryStartTime
      logger.warn("Retry timeout reached", { duration: totalDuration, retryCount })
      return {
        success: false,
        hasAccess: false,
        error: `Access check timed out after ${Math.round(totalDuration / 1000)} seconds. Please try again later.`,
      }
    }

    retryCount++
    const retryStart = Date.now()

    // Calculate remaining time and adjust delay if needed
    const remainingTime = MAX_RETRY_TIMEOUT_MS - elapsedTime
    const adjustedDelay = Math.min(delay, remainingTime)

    if (adjustedDelay <= 0) {
      const totalDuration = Date.now() - retryStartTime
      logger.warn("No time remaining for retry", { duration: totalDuration })
      return {
        success: false,
        hasAccess: false,
        error: `Access check timed out after ${Math.round(totalDuration / 1000)} seconds. Please try again later.`,
      }
    }

    logger.debug("Retrying access check", {
      attempt: retryCount,
      maxRetries,
      delay: adjustedDelay,
      remainingSeconds: Math.round(remainingTime / 1000),
    })

    await waitForDelay(adjustedDelay)
    const waitDuration = Date.now() - retryStart
    logger.debug("Wait completed, performing access check", { waitDuration })

    accessCheck = await performAccessCheck(serverConfig, plexUserId)

    if (accessCheck.hasAccess) {
      const totalDuration = Date.now() - retryStartTime
      logger.info("Access granted on retry attempt", { attempt: retryCount, duration: totalDuration })
      return accessCheck
    }

    delay *= EXPONENTIAL_BACKOFF_MULTIPLIER
  }

  const totalDuration = Date.now() - retryStartTime
  if (!accessCheck.hasAccess) {
    logger.warn("Access check failed after retries", { retryCount, duration: totalDuration })
  }

  return accessCheck
}

/**
 * Log access denied event
 */
function logAccessDenied(
  plexUser: PlexUserInfo,
  serverUrl: string,
  reason: string,
  retriesAttempted: number
): void {
  logger.warn("Plex user denied access", {
    plexUserId: plexUser.id,
    username: plexUser.username,
    // Email is automatically sanitized by logger in production
    serverUrl,
    reason,
    retriesAttempted,
  })
}

/**
 * Check if a user has access to the configured Plex server.
 *
 * `{ hasAccess: false }` is a clean "no access" answer. A check that could not
 * be completed (no server, plex.tv unreachable, timeout) is a failure with
 * `UPSTREAM_UNAVAILABLE` or `NOT_FOUND`, never a guess, and never carries the
 * underlying error text.
 *
 * @param input - `{ token, isInviteFlow }`; invite flows retry with the fixed
 *   server-side schedule above.
 */
export const checkServerAccess = publicAction({
  input: checkServerAccessSchema,
  fallbackError: ACCESS_CHECK_FAILED,
  handler: async ({ token: userToken, isInviteFlow }) => {
    const functionStartTime = Date.now()
    const maxRetries = isInviteFlow ? INVITE_FLOW_MAX_RETRIES : 0

    logger.debug("checkServerAccess called", { isInviteFlow, maxRetries })

    if (isInviteFlow) {
      logger.debug("Applying initial delay for invite flow", { initialDelay: INVITE_FLOW_INITIAL_DELAY_MS })
      await waitForDelay(INVITE_FLOW_INITIAL_DELAY_MS)
    }

    const serverResult = await getActivePlexServer()
    if (!serverResult.success || !serverResult.data) {
      logger.warn("checkServerAccess failed: No server config", { duration: Date.now() - functionStartTime })
      return fail("NOT_FOUND", "No Plex server is configured.")
    }

    const userResult = await fetchPlexUser(userToken)
    if (!userResult.success || !userResult.data) {
      logger.warn("checkServerAccess failed: Failed to fetch user", {
        duration: Date.now() - functionStartTime,
        error: userResult.error,
      })
      return fail("UPSTREAM_UNAVAILABLE", ACCESS_CHECK_FAILED)
    }

    const plexUser = userResult.data
    const serverConfig = serverResult.data

    logger.debug("Starting access check", { plexUserId: plexUser.id, username: plexUser.username })

    const accessCheck =
      maxRetries > 0
        ? // The initial delay was applied above; the first retry waits DEFAULT_RETRY_DELAY_MS.
          await retryAccessCheckWithBackoff(serverConfig, plexUser.id, maxRetries, DEFAULT_RETRY_DELAY_MS)
        : await performAccessCheck(serverConfig, plexUser.id)

    if (!accessCheck.hasAccess) {
      logAccessDenied(plexUser, serverConfig.url, accessCheck.error || "No access to server", maxRetries)
    }

    logger.info("checkServerAccess completed", {
      duration: Date.now() - functionStartTime,
      hasAccess: accessCheck.hasAccess,
    })

    if (!accessCheck.success && !accessCheck.hasAccess) {
      return fail("UPSTREAM_UNAVAILABLE", ACCESS_CHECK_FAILED)
    }
    return ok({ hasAccess: accessCheck.hasAccess })
  },
})

/**
 * Whether the Stripe subscription gate is enabled (`Config.stripeEnabled`).
 *
 * Client-safe and intentionally unauthenticated: the Plex sign-in callback runs
 * this for a user who has NOT been admitted yet (a non-member), so it cannot use
 * the admin-only `getStripeConfig()`. It leaks only a single boolean — no
 * secrets — so it is safe to expose to any caller.
 *
 * When this returns `true`, a Plex user who lacks server access should still be
 * allowed to sign in and be routed to `/subscribe` (the `(app)` layout guard
 * enforces the gate). When `false`, no-access users are denied exactly as before
 * the Stripe feature existed. Callers fail closed: anything but
 * `{ success: true, data: true }` is "off", so a DB hiccup can never
 * accidentally admit a non-member.
 */
export const isSubscriptionGatingEnabled = publicAction({
  handler: async () => {
    const config = await prisma.config.findUnique({
      where: { id: "config" },
      select: { stripeEnabled: true },
    })

    return ok(Boolean(config?.stripeEnabled))
  },
})

