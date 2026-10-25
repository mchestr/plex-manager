/**
 * Granting and removing a member's access on each service they use
 * (`memberServices`, P11.11, GAP-23):
 *
 * | Service  | Grant                                         | Revoke                     |
 * |----------|-----------------------------------------------|----------------------------|
 * | Plex     | invite the member's Plex email, auto-accept   | unshare the active server  |
 * | Jellyfin | turn the account on (`IsDisabled: false`)     | turn the account off       |
 *
 * The Stripe grant and revoke jobs and admin grants call these; member removal
 * (P11.13) calls the revoke before any database change. A Plex invite goes
 * only to the email on a row with a `plexUserId`, which came from plex.tv; a
 * Jellyfin username is never used as an address. A member with no usable
 * identity is skipped with `NO_MEMBER_SERVICE` rather than failing, so the
 * job does not retry forever.
 *
 * @module lib/members/access-actions
 */

import "server-only"

import { unshareUserFromPlexServer } from "@/lib/connections/plex"
import { acceptPlexInvite, inviteUserToPlexServer } from "@/lib/connections/plex-invitations"
import { setJellyfinAccountDisabled } from "@/lib/connections/jellyfin-users"
import { withMachineIdentifier } from "@/lib/connections/plex-machine-id"
import { checkUserServerAccess } from "@/lib/connections/plex-user-access"
import { memberServices } from "@/lib/members/service"
import { prisma } from "@/lib/prisma"
import { parseStripeLibrarySectionIds } from "@/lib/stripe/config"
import { createLogger } from "@/lib/utils/logger"
import { getActiveService } from "@/lib/data/active-service"

const logger = createLogger("MEMBER_ACCESS")

/** Recorded on the subscription when a grant or revoke had no account to act on. */
export const NO_MEMBER_SERVICE = "NO_MEMBER_SERVICE"

type PlexGrantStatus = "accepted" | "pending" | "skipped"
type JellyfinGrantStatus = "enabled" | "skipped"

type GrantAccessFailure = "NO_PLEX_SERVER" | "NO_JELLYFIN_SERVER" | "PLEX_INVITE_FAILED" | "JELLYFIN_UNAVAILABLE"

export type GrantAccessResult =
  | { success: true; plex?: PlexGrantStatus; jellyfin?: JellyfinGrantStatus; skipCode?: typeof NO_MEMBER_SERVICE }
  | { success: false; code: GrantAccessFailure }

interface GrantTarget {
  id: string
  email: string | null
  plexUserId: string | null
  plexAuthToken: string | null
  jellyfinUserId: string | null
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
 * Gives the member access on every service they have an account on: Jellyfin
 * first, because turning an account on is safe to repeat, then the Plex
 * invite, so a retry after a Plex failure does not invite twice.
 *
 * @param user - The member's identifiers, email and stored Plex token.
 * @returns Each service's outcome, `skipCode` when any had no usable
 *   identity, or a failure code the caller retries on.
 */
export async function grantServiceAccess(user: GrantTarget): Promise<GrantAccessResult> {
  const services = memberServices(user)
  if (services.length === 0) {
    logger.warn("access.grant.skipped", { userId: user.id, code: NO_MEMBER_SERVICE })
    return { success: true, skipCode: NO_MEMBER_SERVICE }
  }

  const result: { plex?: PlexGrantStatus; jellyfin?: JellyfinGrantStatus } = {}

  if (user.jellyfinUserId) {
    const server = await getActiveService("jellyfin")
    if (!server) return { success: false, code: "NO_JELLYFIN_SERVER" }
    const enabled = await setJellyfinAccountDisabled(server, user.jellyfinUserId, false)
    if (!enabled.success) return { success: false, code: "JELLYFIN_UNAVAILABLE" }
    if (enabled.status === "not_found") {
      logger.warn("access.grant.skipped", { userId: user.id, service: "jellyfin", reason: "account not found" })
    }
    result.jellyfin = enabled.status === "not_found" ? "skipped" : "enabled"
  }

  if (user.plexUserId) {
    const plex = await grantPlex({ ...user, plexUserId: user.plexUserId })
    if ("code" in plex) return { success: false, code: plex.code }
    result.plex = plex.status
  }

  return { success: true, ...result, ...(result.plex === "skipped" && { skipCode: NO_MEMBER_SERVICE }) }
}

/** What happened on one service; `no_server` means none is configured. */
type PlexRevokeStatus = "removed" | "already_removed" | "no_server"
type JellyfinRevokeStatus = "disabled" | "already_disabled" | "not_found" | "no_server"

export type RevokeAccessFailure = "PLEX_AUTH" | "PLEX_UNAVAILABLE" | "JELLYFIN_ADMIN" | "JELLYFIN_UNAVAILABLE"

export type RevokeAccessResult =
  | { success: true; plex?: PlexRevokeStatus; jellyfin?: JellyfinRevokeStatus }
  | { success: false; code: RevokeAccessFailure }

const JELLYFIN_STATUS = { changed: "disabled", unchanged: "already_disabled", not_found: "not_found" } as const

/**
 * Unshares the member from Plex and disables their Jellyfin account, for each
 * service they have an identity on. Idempotent: an access already gone
 * reports `already_removed` or `already_disabled`.
 *
 * @param user - The member's identifiers.
 */
export async function revokeServiceAccess(user: {
  plexUserId: string | null
  jellyfinUserId: string | null
}): Promise<RevokeAccessResult> {
  const result: { plex?: PlexRevokeStatus; jellyfin?: JellyfinRevokeStatus } = {}
  const services = memberServices(user)

  if (services.includes("plex") && user.plexUserId) {
    const server = await getActiveService("plex")
    if (!server) {
      result.plex = "no_server"
    } else {
      const { url, token, machineIdentifier } = await withMachineIdentifier(server)
      const unshared = await unshareUserFromPlexServer({ url, token, machineIdentifier }, user.plexUserId)
      if (!unshared.success) return { success: false, code: unshared.code }
      result.plex = unshared.status
    }
  }

  if (services.includes("jellyfin") && user.jellyfinUserId) {
    const server = await getActiveService("jellyfin")
    if (!server) {
      result.jellyfin = "no_server"
    } else {
      const disabled = await setJellyfinAccountDisabled(server, user.jellyfinUserId, true)
      if (!disabled.success) return { success: false, code: disabled.code }
      result.jellyfin = JELLYFIN_STATUS[disabled.status]
    }
  }

  return { success: true, ...result }
}
