/**
 * Removing a member's access on each service they use (`memberServices`):
 * the Plex share of the active server, and the Jellyfin account, which is
 * disabled rather than deleted. Member removal (P11.13) calls it before any
 * database change, so a failure stops the removal with a code and a rerun
 * picks up where it left off.
 *
 * @module lib/members/access-actions
 */

import "server-only"

import { unshareUserFromPlexServer } from "@/lib/connections/plex"
import { setJellyfinAccountDisabled } from "@/lib/connections/jellyfin-users"
import { withMachineIdentifier } from "@/lib/connections/plex-machine-id"
import { memberServices } from "@/lib/members/service"
import { prisma } from "@/lib/prisma"

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
    const server = await prisma.plexServer.findFirst({ where: { isActive: true } })
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
    const server = await prisma.jellyfinServer.findFirst({ where: { isActive: true }, select: { url: true, apiKey: true } })
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
