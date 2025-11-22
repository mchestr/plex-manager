"use server"

import { checkUserServerAccess, getPlexUserInfo, type PlexUserInfo } from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("AUTH_ACTION")

// Constants
const DEFAULT_RETRY_DELAY_MS = 2000
const EXPONENTIAL_BACKOFF_MULTIPLIER = 2
const MAX_RETRY_TIMEOUT_MS = 3 * 60 * 1000 // 3 minutes

// Types
interface RetryOptions {
  maxRetries?: number
  initialDelay?: number
  isInviteFlow?: boolean
}

interface ServerAccessResult {
  success: boolean
  hasAccess: boolean
  error?: string
}

interface PlexServerConfig {
  hostname: string
  port: number
  protocol: string
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
      hostname: plexServer.hostname,
      port: plexServer.port,
      protocol: plexServer.protocol,
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
  serverHostname: string,
  reason: string,
  retriesAttempted: number
): void {
  logger.warn("Plex user denied access", {
    plexUserId: plexUser.id,
    username: plexUser.username,
    // Email is automatically sanitized by logger in production
    serverHostname,
    reason,
    retriesAttempted,
  })
}

/**
 * Check if a user has access to the configured Plex server
 * @param userToken - Plex authentication token
 * @param retryOptions - Optional retry configuration for invite flows
 */
export async function checkServerAccess(
  userToken: string,
  retryOptions?: RetryOptions
): Promise<ServerAccessResult> {
  const functionStartTime = Date.now()
  const maxRetries = retryOptions?.maxRetries ?? 0
  const initialDelay = retryOptions?.initialDelay ?? DEFAULT_RETRY_DELAY_MS
  const isInviteFlow = retryOptions?.isInviteFlow ?? false

  logger.debug("checkServerAccess called", {
    isInviteFlow,
    maxRetries,
    initialDelay,
  })

  try {
    if (isInviteFlow && initialDelay > 0) {
      const delayStart = Date.now()
      logger.debug("Applying initial delay for invite flow", { initialDelay })
      await waitForDelay(initialDelay)
      const delayDuration = Date.now() - delayStart
      logger.debug("Initial delay completed", { duration: delayDuration })
    }

    const serverStartTime = Date.now()
    logger.debug("Fetching active Plex server configuration")
    const serverResult = await getActivePlexServer()
    const serverDuration = Date.now() - serverStartTime
    logger.debug("Server config fetched", { duration: serverDuration, success: serverResult.success })

    if (!serverResult.success || !serverResult.data) {
      const totalDuration = Date.now() - functionStartTime
      logger.warn("checkServerAccess failed: No server config", { duration: totalDuration })
      return {
        success: false,
        hasAccess: false,
        error: serverResult.error,
      }
    }

    const userStartTime = Date.now()
    logger.debug("Fetching Plex user info")
    const userResult = await fetchPlexUser(userToken)
    const userDuration = Date.now() - userStartTime
    logger.debug("User info fetched", { duration: userDuration, success: userResult.success })

    if (!userResult.success || !userResult.data) {
      const totalDuration = Date.now() - functionStartTime
      logger.warn("checkServerAccess failed: Failed to fetch user", { duration: totalDuration })
      return {
        success: false,
        hasAccess: false,
        error: userResult.error,
      }
    }

    const plexUser = userResult.data
    const serverConfig = serverResult.data

    logger.debug("Starting access check", {
      plexUserId: plexUser.id,
      username: plexUser.username,
      hostname: serverConfig.hostname,
    })

    let accessCheck: ServerAccessResult
    const accessCheckStartTime = Date.now()

    if (isInviteFlow && maxRetries > 0) {
      // Initial delay (initialDelay) was already applied above (lines 216-222) before the first access check.
      // For retries, we use DEFAULT_RETRY_DELAY_MS as the first retry delay to avoid reusing initialDelay,
      // which would cause the first retry to wait unnecessarily long (double delay issue).
      accessCheck = await retryAccessCheckWithBackoff(serverConfig, plexUser.id, maxRetries, DEFAULT_RETRY_DELAY_MS)
    } else {
      accessCheck = await performAccessCheck(serverConfig, plexUser.id)
    }

    const accessCheckDuration = Date.now() - accessCheckStartTime
    logger.debug("Access check phase completed", { duration: accessCheckDuration })

    if (!accessCheck.hasAccess) {
      const retriesAttempted = isInviteFlow && maxRetries > 0 ? maxRetries : 0
      logAccessDenied(
        plexUser,
        serverConfig.hostname,
        accessCheck.error || "No access to server",
        retriesAttempted
      )
    }

    const totalDuration = Date.now() - functionStartTime
    logger.info("checkServerAccess completed", {
      duration: totalDuration,
      hasAccess: accessCheck.hasAccess,
    })

    return accessCheck
  } catch (error) {
    const totalDuration = Date.now() - functionStartTime
    logger.error("Error checking server access", error, { duration: totalDuration })
    return {
      success: false,
      hasAccess: false,
      error: error instanceof Error ? error.message : "Failed to check server access",
    }
  }
}

