/**
 * Whether a Plex account may use this server, as a tri-state (GAP-05).
 *
 * - `granted`: the owner, or a user with an accepted share of this server's
 *   machine identifier.
 * - `denied`: plex.tv answered and the user has no accepted share. A pending
 *   invite is denied until it is accepted.
 * - `unknown`: plex.tv or the PMS could not answer (429 with its
 *   `Retry-After`, 5xx, timeout, network or parse error, or the owner token
 *   refused). Following Plex's auth guide this is an error state, never a
 *   verdict: callers fail closed where they must, but never show it as
 *   "no access" and never remove a role on it.
 *
 * The machine identifier comes from `PlexServer.machineIdentifier` when the
 * caller passes it, so a PMS restart does not block a decision plex.tv makes.
 *
 * @module lib/connections/plex-user-access
 */

import { resolveMachineIdentifier } from "./plex-connection"
import { logger, sanitizeUrlForLogging } from "./plex-core"
import { activeShareFor, fetchPlexTvUsers } from "./plex-tv-users"

type PlexAccessUnknownReason = "plex_unavailable" | "rate_limited" | "server_unreachable" | "server_token_invalid"

export type PlexAccessResult =
  | { status: "granted" }
  | { status: "denied" }
  | { status: "unknown"; reason: PlexAccessUnknownReason; retryAfterSec?: number }

export interface PlexAccessServerConfig {
  url: string
  /** Null when the stored token cannot be decrypted with the current key (P11.1). */
  token: string | null
  adminPlexUserId?: string | null
  /** The stored `PlexServer.machineIdentifier`; without it the PMS `/identity` is asked. */
  machineIdentifier?: string | null
}

/**
 * Checks whether `plexUserId` may use the configured Plex server. Never
 * throws; see the module docs for the three results.
 */
export async function checkUserServerAccess(
  serverConfig: PlexAccessServerConfig,
  plexUserId: string
): Promise<PlexAccessResult> {
  const startedAt = Date.now()
  const userId = String(plexUserId).trim()

  if (serverConfig.adminPlexUserId && userId === String(serverConfig.adminPlexUserId).trim()) {
    logger.info("User is the server owner, granting access", { plexUserId: userId })
    return { status: "granted" }
  }

  // An unreadable stored token (P11.1): the owner still signs in above to enter it again
  if (!serverConfig.token) {
    logger.error("Plex access unknown: the server token is missing or unreadable")
    return { status: "unknown", reason: "server_token_invalid" }
  }

  const identity = await resolveMachineIdentifier({ ...serverConfig, token: serverConfig.token })
  if (!identity.success || !identity.machineIdentifier) {
    logger.warn("Plex access unknown: no machine identifier", {
      url: sanitizeUrlForLogging(serverConfig.url),
      error: identity.error,
      duration: Date.now() - startedAt,
    })
    return { status: "unknown", reason: "server_unreachable" }
  }

  const users = await fetchPlexTvUsers(serverConfig.token)
  if (!users.ok) {
    const duration = Date.now() - startedAt
    if (users.kind === "invalid_token") {
      logger.error("Plex access unknown: plex.tv refused the server owner's token", undefined, { duration })
      return { status: "unknown", reason: "server_token_invalid" }
    }
    logger.warn("Plex access unknown: plex.tv unavailable", { reason: users.reason, status: users.status, duration })
    if (users.reason === "rate_limited") {
      return users.retryAfterSec === undefined
        ? { status: "unknown", reason: "rate_limited" }
        : { status: "unknown", reason: "rate_limited", retryAfterSec: users.retryAfterSec }
    }
    return { status: "unknown", reason: "plex_unavailable" }
  }

  const user = users.users.find((candidate) => candidate.id === userId)
  const granted = Boolean(user && activeShareFor(user, identity.machineIdentifier))
  logger.info(granted ? "User has access" : "User does not have access", {
    plexUserId: userId,
    pendingInvite: Boolean(user?.servers.some((share) => share.machineIdentifier === identity.machineIdentifier && share.pending)),
    duration: Date.now() - startedAt,
  })
  return granted ? { status: "granted" } : { status: "denied" }
}
