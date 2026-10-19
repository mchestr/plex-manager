/**
 * The server-wide yearly aggregate (design 7.4, RWP-17, RWP-18): a pure
 * function of one server-wide history pass, the Overseerr pass and the Plex
 * library listing.
 *
 * ## What it holds
 *
 * - `members`: total minutes per matched member, over that member's own
 *   window in their own Rewind zone, so the percentile agrees with the
 *   member's own hours. Unmatched Tautulli users are anonymous (`userId:
 *   null`) and use the server zone.
 * - `titles`: per film (`rating_key`) and series (`grandparent_rating_key`),
 *   the viewer count and each viewer's minutes, highest first, without user
 *   ids, for "#1 of N viewers here". Only titles with 3 or more viewers are
 *   kept, because nothing smaller is ever shown. A viewer is one with a
 *   counted play; plays kept out of lists (FR-44) never make a title.
 * - `community`: `./community.ts`.
 * - `archetypeCounts` and `medians` stay null until P2.9.
 *
 * Names and emails are never inputs, and the result is checked against the
 * strict schema in `./schema.ts` before it is returned. The aggregate never
 * reaches the LLM.
 *
 * @module lib/wrapped/aggregate/server-year
 */

import type { LibraryItem } from "@/lib/wrapped/sources/plex-library"
import type { RequestEvent } from "@/lib/wrapped/sources/request-event"
import { isCountedPlay, type PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { inWindow } from "@/lib/wrapped/time/zone"

import { computeCommunity, type ViewerPlays } from "./community"
import { MIN_CONTRIBUTORS, serverAggregateSchema, type ServerAggregate } from "./schema"
import { throughFor, zoneWindow, type BatchWindow } from "./window"

/** A member matched to a Tautulli user, with the zone their Rewind is read in. */
export interface AggregateMember {
  userId: string
  tautulliUserId: string
  zone: string
}

export interface ServerYearInput {
  /** Plays by Tautulli `user_id`, from `fetchServerYear()` over the union of every window. */
  eventsByTautulliUser: ReadonlyMap<string, readonly PlayEvent[]>
  members: readonly AggregateMember[]
  window: BatchWindow
  /** The server-wide Overseerr pass, or null when Overseerr is not configured or failed. */
  serverRequests: readonly RequestEvent[] | null
  libraryItems: readonly LibraryItem[]
}

/**
 * Total minutes: every second of every play, floored once at the end. The
 * same rule as P2.7's `totals.ts` total.
 *
 * @example
 * ```ts
 * totalMinutes([{ playSeconds: 50 }, { playSeconds: 50 }, { playSeconds: 50 }]) // 2
 * ```
 *
 * @internal Exported for tests.
 */
export function totalMinutes(events: readonly Pick<PlayEvent, "playSeconds">[]): number {
  return Math.floor(events.reduce((sum, e) => sum + e.playSeconds, 0) / 60)
}

/** `film:<ratingKey>` or `series:<grandparentRatingKey>`; null for anything else. */
function titleKeyOf(e: PlayEvent): string | null {
  if (e.mediaType === "movie") return `film:${e.ratingKey}`
  if (e.mediaType === "episode" && e.grandparentRatingKey) return `series:${e.grandparentRatingKey}`
  return null
}

function titleViewers(viewers: readonly ViewerPlays[]): ServerAggregate["titles"] {
  const byTitle = new Map<string, Map<string, { seconds: number; counted: boolean }>>()
  for (const viewer of viewers) {
    for (const e of viewer.events) {
      const key = titleKeyOf(e)
      if (!key || e.excludedFromLists) continue
      const perViewer = byTitle.get(key) ?? new Map<string, { seconds: number; counted: boolean }>()
      const entry = perViewer.get(viewer.viewerId) ?? { seconds: 0, counted: false }
      entry.seconds += e.playSeconds
      entry.counted ||= isCountedPlay(e)
      perViewer.set(viewer.viewerId, entry)
      byTitle.set(key, perViewer)
    }
  }

  const titles: ServerAggregate["titles"] = {}
  for (const [key, perViewer] of byTitle) {
    const minutes = [...perViewer.values()]
      .filter((v) => v.counted)
      .map((v) => Math.floor(v.seconds / 60))
      .sort((a, b) => b - a)
    if (minutes.length >= MIN_CONTRIBUTORS) titles[key] = { viewers: minutes.length, minutes }
  }
  return titles
}

/**
 * Computes the aggregate for one batch.
 *
 * @throws ZodError when the result breaks the strict schema, which only a bug can cause.
 */
export function computeServerYear(input: ServerYearInput): ServerAggregate {
  const { window } = input
  const serverWindow = zoneWindow(window, window.serverZone)
  const memberByTautulliId = new Map(input.members.map((m) => [m.tautulliUserId, m]))

  const viewers: ViewerPlays[] = []
  const members: ServerAggregate["members"] = []
  for (const member of input.members) {
    const own = zoneWindow(window, member.zone)
    const events = (input.eventsByTautulliUser.get(member.tautulliUserId) ?? []).filter((e) => inWindow(e.startedAt, own))
    viewers.push({ viewerId: `member:${member.userId}`, events })
    members.push({ userId: member.userId, minutes: totalMinutes(events) })
  }
  for (const [tautulliUserId, all] of input.eventsByTautulliUser) {
    if (memberByTautulliId.has(tautulliUserId)) continue
    const events = all.filter((e) => inWindow(e.startedAt, serverWindow))
    if (events.length === 0) continue
    viewers.push({ viewerId: `tautulli:${tautulliUserId}`, events })
    members.push({ userId: null, minutes: totalMinutes(events) })
  }
  members.sort((a, b) => b.minutes - a.minutes)

  return serverAggregateSchema.parse({
    version: 1,
    year: window.year,
    through: throughFor(window.year, window),
    finalCut: window.finalCut,
    serverZone: window.serverZone,
    members,
    titles: titleViewers(viewers),
    community: computeCommunity({
      viewers,
      serverWindow,
      serverRequests: input.serverRequests,
      libraryItems: input.libraryItems,
    }),
    archetypeCounts: null,
    medians: null,
  })
}
