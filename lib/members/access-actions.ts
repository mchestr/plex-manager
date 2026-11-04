/**
 * Granting and removing a member's Plex access (P11.11, GAP-23): a grant
 * invites the member's Plex email and auto-accepts it, a revoke unshares the
 * active server.
 *
 * The Stripe grant and revoke jobs and admin grants call these; member removal
 * (P11.13) calls the revoke before any database change. A Plex invite goes
 * only to the email on a row with a `plexUserId`, which came from plex.tv. A
 * member with no usable identity is skipped with `NO_MEMBER_SERVICE` rather
 * than failing, so the job does not retry forever.
 *
 * @module lib/members/access-actions
 */

import "server-only"

import { unshareUserFromPlexServer } from "@/lib/connections/plex"
import { acceptPlexInvite, inviteUserToPlexServer } from "@/lib/connections/plex-invitations"
import { withMachineIdentifier } from "@/lib/connections/plex-machine-id"
import { checkUserServerAccess } from "@/lib/connections/plex-user-access"
import { prisma } from "@/lib/prisma"
import { parseStripeLibrarySectionIds } from "@/lib/stripe/config"
import { createLogger } from "@/lib/utils/logger"
import { getActiveService } from "@/lib/data/active-service"

const logger = createLogger("MEMBER_ACCESS")

/** Recorded on the subscription when a grant or revoke had no account to act on. */
export const NO_MEMBER_SERVICE = "NO_MEMBER_SERVICE"

type PlexGrantStatus = "accepted" | "pending" | "skipped"

type GrantAccessFailure = "NO_PLEX_SERVER" | "PLEX_INVITE_FAILED"

export type GrantAccessResult =
  | { success: true; plex?: PlexGrantStatus; skipCode?: typeof NO_MEMBER_SERVICE }
  | { success: false; code: GrantAccessFailure }

interface GrantTarget {
  id: string
  email: string | null
  plexUserId: string | null
  plexAuthToken: string | null
}

type PlexGrant = { status: PlexGrantStatus } | { code: GrantAccessFailure }

/**
 * Shares the active Plex server with the member: an existing share counts as
 * `accepted`; otherwise the member's Plex email is invited to the subscriber
 * libraries and the invite auto-accepted with their stored token, else left
 * `pending` for them to accept by email (FR-13). No email is `skipped`.
 */
async function grantPlex(user: GrantTarget & { plexUserId: string }): Promise<PlexGrant> {
  const active = await getActiveService("plex")
  if (!active) return { code: "NO_PLEX_SERVER" }
  const server = await withMachineIdentifier(active)

  const access = await checkUserServerAccess(
    { url: server.url, token: server.token, adminPlexUserId: server.adminPlexUserId, machineIdentifier: server.machineIdentifier },
    user.plexUserId
  )
  if (access.status === "granted") return { status: "accepted" }

  if (!user.email) {
    logger.warn("access.grant.skipped", { userId: user.id, service: "plex", code: NO_MEMBER_SERVICE })
    return { status: "skipped" }
  }

  // An empty or malformed subscriber library selection shares every library.
  const config = await prisma.config.findUnique({ where: { id: "config" }, select: { stripeLibrarySectionIds: true } })
  const librarySectionIds = parseStripeLibrarySectionIds(config?.stripeLibrarySectionIds)
  const invite = await inviteUserToPlexServer(
    { url: server.url, token: server.token, machineIdentifier: server.machineIdentifier },
    user.email,
    librarySectionIds.length > 0 ? { librarySectionIds } : undefined
  )
  if (!invite.success) {
    logger.warn("access.grant.plex_invite_failed", { userId: user.id, error: invite.error })
    return { code: "PLEX_INVITE_FAILED" }
  }

  if (user.plexAuthToken && invite.inviteID !== undefined) {
    const accepted = await acceptPlexInvite(user.plexAuthToken, invite.inviteID)
    if (accepted.success) return { status: "accepted" }
    logger.warn("Plex auto-accept failed; leaving invite pending", { userId: user.id, error: accepted.error })
  }
  return { status: "pending" }
}

/**
 * Gives the member access on Plex.
 *
 * @param user - The member's Plex identifier, email and stored Plex token.
 * @returns The Plex outcome, `skipCode` when there was no usable identity,
 *   or a failure code the caller retries on.
 */
export async function grantServiceAccess(user: GrantTarget): Promise<GrantAccessResult> {
  if (!user.plexUserId) {
    logger.warn("access.grant.skipped", { userId: user.id, code: NO_MEMBER_SERVICE })
    return { success: true, skipCode: NO_MEMBER_SERVICE }
  }

  const plex = await grantPlex({ ...user, plexUserId: user.plexUserId })
  if ("code" in plex) return { success: false, code: plex.code }
  return { success: true, plex: plex.status, ...(plex.status === "skipped" && { skipCode: NO_MEMBER_SERVICE }) }
}

/** What happened on Plex; `no_server` means none is configured. */
type PlexRevokeStatus = "removed" | "already_removed" | "no_server"

export type RevokeAccessFailure = "PLEX_AUTH" | "PLEX_UNAVAILABLE"

export type RevokeAccessResult = { success: true; plex?: PlexRevokeStatus } | { success: false; code: RevokeAccessFailure }

/**
 * Unshares the member from the active Plex server when they have a Plex
 * identity. Idempotent: an access already gone reports `already_removed`.
 *
 * @param user - The member's identifiers.
 */
export async function revokeServiceAccess(user: { plexUserId: string | null }): Promise<RevokeAccessResult> {
  if (!user.plexUserId) return { success: true }

  const server = await getActiveService("plex")
  if (!server) return { success: true, plex: "no_server" }
  const { url, token, machineIdentifier } = await withMachineIdentifier(server)
  const unshared = await unshareUserFromPlexServer({ url, token, machineIdentifier }, user.plexUserId)
  if (!unshared.success) return { success: false, code: unshared.code }
  return { success: true, plex: unshared.status }
}
