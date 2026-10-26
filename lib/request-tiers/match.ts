/**
 * Pairs Overseerr users with Tautulli users. Both name a member by the plex.tv
 * account id: Overseerr's `plexId` is Tautulli's `user_id`. An Overseerr user
 * without a `plexId` (a local or Jellyfin account) is skipped.
 *
 * @module lib/request-tiers/match
 */

import type { Quota } from "@/lib/request-tiers/quota"

export interface OverseerrQuotaUser extends Quota {
  id: number
  plexId: number | null
  name: string
}

export interface MatchedUser {
  overseerr: OverseerrQuotaUser
  tautulliUserId: number
  /** True when the app's own user for this Plex id is excluded from the tier job. */
  excluded: boolean
}

export interface UserMatch {
  matched: MatchedUser[]
  /** Overseerr users with no Plex id. */
  withoutPlexId: number
  /** Overseerr users with a Plex id that Tautulli does not know. */
  withoutTautulli: number
}

/**
 * @param excludedPlexIds - `plexUserId` of every app user an admin excluded
 */
export function matchUsers(
  overseerrUsers: readonly OverseerrQuotaUser[],
  tautulliUserIds: readonly number[],
  excludedPlexIds: ReadonlySet<number>
): UserMatch {
  const known = new Set(tautulliUserIds)
  const result: UserMatch = { matched: [], withoutPlexId: 0, withoutTautulli: 0 }
  for (const user of overseerrUsers) {
    if (user.plexId == null) {
      result.withoutPlexId++
    } else if (!known.has(user.plexId)) {
      result.withoutTautulli++
    } else {
      result.matched.push({ overseerr: user, tautulliUserId: user.plexId, excluded: excludedPlexIds.has(user.plexId) })
    }
  }
  return result
}
