/**
 * Which titles a member may report: only ones in libraries the server shares
 * with them (SEC-21), checked on the server for every rating key.
 *
 * Admins and the server owner see every library. Anyone else needs their
 * Plex account's share list from plex.tv (`getSharedSectionKeys`) to name the
 * item's section. One metadata read gives the section, the ids and the
 * display fields, and it is remembered for the poster route's own check.
 *
 * @module
 */

import "server-only"

import { getPlexItemMetadata, type PlexItemMetadata } from "@/lib/connections/plex"
import { getActivePlexServerConfig, type PlexServerConfig } from "@/lib/connections/plex-config"
import { getSharedSectionKeys, rememberItemSectionKey } from "@/lib/connections/plex-shared-sections"
import { prisma } from "@/lib/prisma"
import { REPORTABLE_MEDIA_TYPES } from "@/lib/problem-reports/taxonomy"

/** Which sections a member may browse: all of them, or a set of section keys. */
export type LibraryAccess = { all: true } | { all: false; sections: ReadonlySet<string> }

/** `NOT_FOUND` when the member may not report it (or it doesn't exist); `UNAVAILABLE` when Plex or plex.tv can't say. */
export type MemberItem =
  | { ok: true; item: PlexItemMetadata; server: PlexServerConfig }
  | { ok: false; reason: "NOT_FOUND" | "UNAVAILABLE" }

/**
 * The libraries a member may browse on the active server, or `null` when
 * plex.tv can't be read. A member without a Plex account has none.
 */
export async function memberLibraryAccess(userId: string, server: PlexServerConfig): Promise<LibraryAccess | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plexUserId: true, isAdmin: true } })
  if (user?.isAdmin || (user?.plexUserId && user.plexUserId === server.adminPlexUserId)) return { all: true }
  if (!user?.plexUserId) return { all: false, sections: new Set() }
  const shared = await getSharedSectionKeys(server, user.plexUserId)
  if (shared === null) return null
  return shared === "all" ? { all: true } : { all: false, sections: shared }
}

/** Whether an item's section is one the member may browse. */
export function inLibraries(access: LibraryAccess, sectionId: string | undefined): boolean {
  return access.all || (sectionId !== undefined && access.sections.has(sectionId))
}

/**
 * One item as the member may see it: a movie, show or episode in a library
 * shared with them.
 *
 * @param userId - The member
 * @param ratingKey - Any rating key the member sent; anything but digits is `NOT_FOUND`
 */
export async function readMemberItem(userId: string, ratingKey: string): Promise<MemberItem> {
  const server = await getActivePlexServerConfig()
  if (!server) return { ok: false, reason: "UNAVAILABLE" }

  const lookup = await getPlexItemMetadata(server, ratingKey)
  if (lookup.status === "missing") return { ok: false, reason: "NOT_FOUND" }
  if (lookup.status === "unknown") return { ok: false, reason: "UNAVAILABLE" }
  const { item } = lookup
  if (!Object.hasOwn(REPORTABLE_MEDIA_TYPES, item.type)) return { ok: false, reason: "NOT_FOUND" }

  const access = await memberLibraryAccess(userId, server)
  if (access === null) return { ok: false, reason: "UNAVAILABLE" }
  if (!inLibraries(access, item.librarySectionId)) return { ok: false, reason: "NOT_FOUND" }

  if (item.librarySectionId) rememberItemSectionKey(server, item.ratingKey, item.librarySectionId)
  return { ok: true, item, server }
}
