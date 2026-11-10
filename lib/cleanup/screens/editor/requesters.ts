/**
 * The requester options of the editor's member picker (UX 4.4, 8.4
 * "Members who made requests", TS 10.4): each app member with a request in
 * the library data, and each member that the draft already names, with
 * their request count. Matched by Plex account, never by name. Pure and
 * client-safe, but the names are admin data: the loader audits the list
 * (`cleanup-requesters`).
 *
 * Requests count once per title: movies and whole shows, not seasons, and
 * never a declined request. A member reads "former" when the share list
 * says they have no access, or, with no library data, when their access
 * ended. Most requests first, then by name.
 *
 * @module lib/cleanup/screens/editor/requesters
 */

import { applicableRequests } from "@/lib/cleanup/engine/fields/request-set"
import { UNKNOWN_MEMBER } from "@/lib/cleanup/fields/words"
import { ruleRequesterIds } from "@/lib/cleanup/preview/draft"
import type { LoadedSnapshot } from "@/lib/cleanup/snapshot/cache"
import type { RequesterOption } from "@/lib/cleanup/types/rule-parts"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"

/** An app member as the picker reads it. */
export interface PickerMember {
  id: string
  plexUserId: string | null
  name: string | null
  accessEndedAt: Date | null
}

/** Requests by plex.tv account id, over the movie and show items. */
function requestCounts(snapshot: LoadedSnapshot | null): Map<string, number> {
  const counts = new Map<string, number>()
  for (const level of [snapshot?.levels.movie, snapshot?.levels.show]) {
    for (const item of level?.items ?? []) {
      for (const request of applicableRequests(item) ?? []) {
        if (request.by !== null) counts.set(request.by, (counts.get(request.by) ?? 0) + 1)
      }
    }
  }
  return counts
}

/** The picker options for `draft` on the library data. */
export function requesterOptions(input: { snapshot: LoadedSnapshot | null; members: readonly PickerMember[]; draft: RuleDraft }): RequesterOption[] {
  const counts = requestCounts(input.snapshot)
  const users = input.snapshot?.header.facts.users ?? {}
  const named = new Set(ruleRequesterIds(input.draft))
  const options = input.members.flatMap((member): RequesterOption[] => {
    const requests = member.plexUserId === null ? 0 : (counts.get(member.plexUserId) ?? 0)
    if (requests === 0 && !named.has(member.id)) return []
    const user = member.plexUserId !== null && Object.hasOwn(users, member.plexUserId) ? users[member.plexUserId] : undefined
    const former = user ? user.hasAccess === false : member.accessEndedAt !== null
    return [{ userId: member.id, name: member.name ?? UNKNOWN_MEMBER, status: former ? "former" : "member", requests }]
  })
  return options.sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name, "en") || (a.userId < b.userId ? -1 : 1))
}
