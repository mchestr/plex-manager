/**
 * Every Rewind stat for one member, in one call: the P2.7 and P2.8 modules
 * over the member's plays in their own zone and window.
 *
 * The member's pipeline and the server aggregate both call this, so a
 * member's archetype and the server's archetype counts can never be computed
 * two ways (design 7.4). A missing source makes its module ineligible, never
 * an error (NFR-3).
 *
 * @module lib/wrapped/stats/compute
 */

import type { RequestEvent } from "@/lib/wrapped/sources/request-event"
import type { SeasonPremiere } from "@/lib/wrapped/sources/sonarr-calendar"
import { isCountedPlay, type PlayEvent } from "@/lib/wrapped/sources/watch-history-source"

import { computeBookends } from "./bookends"
import { computeCalendar } from "./calendar"
import { computeCommunity } from "./community"
import { computeDevices } from "./devices"
import { videoEvents, type StatsContext } from "./keys"
import type { AggregateView, MetadataLookup } from "./metadata"
import { computeMilestones } from "./milestones"
import { computeNextYear, type LibraryTitle } from "./next-year"
import { computePeople } from "./people"
import { computePopular } from "./popular"
import { computeRace } from "./race"
import { computeRequests } from "./requests"
import { computeSessions } from "./sessions"
import { computeTaste, freshShare } from "./taste"
import { computeTime } from "./time"
import { computeTitles } from "./titles"
import { computeTotals } from "./totals"

/** What the modules read besides the member's plays; null where a source is missing. */
export interface MemberSources {
  /** All the member's plays, for `member.since`, lifetime hours and last year; null without the pass. */
  lifetime: readonly PlayEvent[] | null
  metadata: MetadataLookup | null
  /** The member's Overseerr requests created in the window; null without Overseerr. */
  requests: readonly RequestEvent[] | null
  aggregate: AggregateView | null
  library: readonly LibraryTitle[] | null
  excludedContentRatings: readonly string[]
  /** Sonarr's season premieres for Next year's returning part; null or absent without Sonarr. */
  premieres?: readonly SeasonPremiere[] | null
}

const noMetadata: MetadataLookup = () => undefined

/**
 * @example
 * ```ts
 * const stats = computeMemberStats(events, ctx, { lifetime, metadata, requests: null, aggregate: null, library: null, excludedContentRatings: [] })
 * stats.totals.totalMinutes // 78420
 * stats.plays               // 1258
 * ```
 */
export function computeMemberStats(events: readonly PlayEvent[], ctx: StatsContext, sources: MemberSources) {
  const lookup = sources.metadata ?? noMetadata
  const lifetime = sources.lifetime ?? undefined
  const taste = computeTaste(events, ctx, lookup)
  const people = computePeople(events, ctx, lookup)
  return {
    /** Counted film and episode plays (FR-46): the volume gates read them. */
    plays: videoEvents(events).filter(isCountedPlay).length,
    totals: computeTotals(events, ctx, lifetime),
    time: computeTime(events, ctx),
    calendar: computeCalendar(events, ctx),
    sessions: computeSessions(events, ctx),
    bookends: computeBookends(events, ctx, lifetime),
    race: computeRace(events, ctx),
    milestones: computeMilestones(events, ctx),
    titles: computeTitles(events, ctx, lookup),
    taste,
    /** History's own share (taste's cache fallback included), outside the page's coverage gate. */
    freshShare: freshShare(events, lookup, ctx.zone),
    people,
    devices: computeDevices(events, lookup),
    requests: computeRequests(events, sources.requests, lookup),
    community: computeCommunity(events, ctx, sources.aggregate),
    /** The postcard's community titles (P7.3). */
    popular: computePopular(sources.aggregate, sources.library, ctx, sources.excludedContentRatings),
    nextYear: computeNextYear(events, ctx, lookup, {
      taste,
      people,
      library: sources.library,
      excludedContentRatings: sources.excludedContentRatings,
      premieres: sources.premieres,
    }),
  }
}

export type MemberStats = ReturnType<typeof computeMemberStats>
