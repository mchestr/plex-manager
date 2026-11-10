/**
 * "Who sees it" on the turn-on page (UX 4.6, TS 12.7 item 7): the libraries
 * of the rule, the count of members who can see them in Plex, and the
 * count of members linked to a title of the batch. Counts only, never a
 * name. Server-only: {@link membersWhoCanSee} reads the plex.tv share list
 * through `memberCleanupAccess()` (TS 13.1), the one upstream call of the
 * admin loaders (TS 10.4).
 *
 * A member counts with access in the library data (`hasAccess`), not the
 * server owner, whose Home is "your Home". A member with a label filter on
 * a share counts too: they see the titles that the filter lets through.
 *
 * @module lib/cleanup/screens/turn-on/who-sees
 */

import "server-only"

import { applicableRequests } from "@/lib/cleanup/engine/fields/request-set"
import type { LiveFacts } from "@/lib/cleanup/engine/types"
import { memberCleanupAccess } from "@/lib/cleanup/member/access"
import type { SnapshotItem, SnapshotLibrary, SnapshotUser } from "@/lib/cleanup/schema/snapshot"
import type { PlexServer } from "@/lib/generated/prisma/client"

/** How long the turn-on page waits for plex.tv: the member page budget (TS 13.1, E29). */
const WHO_SEES_TIMEOUT_MS = 1500

type Users = Readonly<Record<string, SnapshotUser>>
type Members = LiveFacts["members"]

/** The libraries of the library data that the rule names (a saved rule names at least one), in Plex order. */
export function ruleLibraries(definition: { libraries: readonly string[] }, libraries: readonly SnapshotLibrary[]): SnapshotLibrary[] {
  return libraries.filter((l) => definition.libraries.includes(l.sectionId))
}

/** The plex.tv ids of the app members with access, without the owner. */
function viewers(members: Members, users: Users): string[] {
  return [...new Set(members.flatMap((m) => {
    const user = m.plexUserId !== null && Object.hasOwn(users, m.plexUserId) ? users[m.plexUserId] : undefined
    return m.plexUserId !== null && user?.hasAccess === true && !user.owner ? [m.plexUserId] : []
  }))]
}

/**
 * The members who can see one of `sectionIds` in Plex, or null when there is
 * no Plex server, no library data, or plex.tv did not answer in time.
 */
export async function membersWhoCanSee(input: { server: PlexServer | null; members: Members; users: Users | null; sectionIds: readonly string[] }):
  Promise<number | null> {
  const { server, users } = input
  if (!server || !users) return null
  const access = await Promise.all(viewers(input.members, users).map((plexUserId) =>
    memberCleanupAccess(server, plexUserId, { timeoutMs: WHO_SEES_TIMEOUT_MS })))
  if (access.some((a) => a === null)) return null
  return access.filter((a) => a === "all" || input.sectionIds.some((id) => a?.has(id))).length
}

/** The members with access who requested or played a title of the batch: they see it under For you. */
export function linkedMembers(items: readonly SnapshotItem[], members: Members, users: Users | null): number {
  if (!users) return 0
  const linked = new Set<string>()
  for (const item of items) {
    for (const request of applicableRequests(item) ?? []) if (request.by !== null) linked.add(request.by)
    for (const viewer of item.plays?.viewers ?? []) if (viewer.counted > 0) linked.add(viewer.user)
  }
  return viewers(members, users).filter((plexUserId) => linked.has(plexUserId)).length
}
