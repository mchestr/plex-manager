/**
 * The requests that apply to an item, and the requester match of TS 4.3.
 * Shared by the request fields and G7. Client-safe.
 *
 * Applicable requests `R`: the snapshot attaches movie requests by TMDB id
 * and show requests by TVDB id, else TMDB id, with every season (TS 7.6). A
 * season item takes the show's requests whose `seasons` include its number,
 * or whose `seasons` is null. Declined requests are already dropped at read
 * time; they are dropped here again, so no path can count one.
 *
 * @module lib/cleanup/engine/fields/request-set
 */

import { FAIL, PASS, passWhen, showOf, sourceFailed, unknown } from "@/lib/cleanup/engine/fields/shared"
import { olderThan } from "@/lib/cleanup/engine/fields/time"
import type { EvalContext, FieldVerdict } from "@/lib/cleanup/engine/types"
import type { RequestFact, SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { RequesterRef } from "@/lib/validations/cleanup-rule"

/** @internal Overseerr `MediaRequestStatus.DECLINED`; exported for the tests. */
export const DECLINED = 3

const live = (requests: readonly RequestFact[]) => requests.filter((r) => r.status !== DECLINED)

/** `R` of TS 4.3 for the item's level, or null when Overseerr failed (`requests` null). */
export function applicableRequests(item: SnapshotItem): RequestFact[] | null {
  if (item.requests === null) return null
  const requests = live(item.requests)
  if (item.level !== "season") return requests
  return requests.filter((r) => r.seasons === null || (item.seasonNumber !== null && r.seasons.includes(item.seasonNumber)))
}

/**
 * The requests whose requesters `request.requesters` reads: `R`, but for a
 * season item the show's requests of any season (TS 4.3). Without the show
 * item, the season's own requests.
 */
export function requesterRequests(item: SnapshotItem, ctx: Pick<EvalContext, "showsByKey">): RequestFact[] | null {
  const show = showOf(item, ctx)
  if (!show) return applicableRequests(item)
  return show.requests === null ? null : live(show.requests)
}

/** The distinct requesters of the requests, newest request first. `null` is a requester with no Plex id. */
export function requestersOf(requests: readonly RequestFact[]): (string | null)[] {
  return [...new Set([...requests].sort((a, b) => b.at - a.at).map((r) => r.by))]
}

/**
 * `matchesRef(by, ref, ctx)` of TS 4.3. A requester with no Plex id is
 * unknown for every ref. `former`: the owner fails, `hasAccess` false
 * passes, null is unknown, and no entry fails. `inactive`: unknown while
 * Tautulli is not ok; no play or an old one passes.
 */
export function matchesRef(by: string | null, ref: RequesterRef, ctx: EvalContext): FieldVerdict {
  if (by === null) return unknown({ kind: "noValue", what: "requester" })
  switch (ref.kind) {
    case "anyMember":
      return PASS
    case "former": {
      const user = ctx.users.get(by)
      if (!user || user.owner) return FAIL
      if (user.hasAccess === null) return unknown({ kind: "noValue", what: "access" })
      return passWhen(user.hasAccess === false)
    }
    case "inactive": {
      if (ctx.sources.tautulli !== "ok") return sourceFailed("tautulli")
      const lastPlayAt = ctx.users.get(by)?.lastPlayAt ?? null
      return passWhen(lastPlayAt === null || olderThan(lastPlayAt, ref.days, ctx.now))
    }
    case "member":
      return passWhen(ctx.memberPlexIds.get(ref.userId) === by)
  }
}

/** The app name of a plex.tv account (`User.name`), else "Unknown member" (X8). Admin surfaces only (TS 13.3). */
export function requesterName(by: string | null, ctx: Pick<EvalContext, "live">): string {
  const member = by === null ? undefined : ctx.live.members.find((m) => m.plexUserId === by)
  return member?.name ?? "Unknown member"
}
