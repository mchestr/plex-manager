/**
 * The standing page's facts (page 15) and each series' viewer rank, read
 * from the member's view of the server aggregate (design 7.4).
 *
 * ## Rules
 *
 * - **Standing** ranks the member among everyone in `aggregate.members` who
 *   pressed play (more than 0 minutes), anonymous Tautulli users included.
 *   `rank` is 1 plus the number with more minutes, so a tie shares the
 *   better rank, and `percentile` is the "Top N%" figure,
 *   `ceil(rank / members * 100)`. Below 5 members, both are null.
 * - **Viewer rank** ("#1 of N viewers here") is the member's place among a
 *   series' viewers in `aggregate.titles`, which keeps only titles with 3 or
 *   more viewers. The member's minutes for a series are its listed minutes,
 *   the same seconds the aggregate summed.
 * - **Community facts** pass through with their contributor counts; any
 *   below 3 contributors reads as null, so nothing can point at one or two
 *   people.
 *
 * Without the aggregate, the module is ineligible.
 *
 * @module lib/wrapped/stats/community
 */

import { MIN_CONTRIBUTORS, type CommunityFacts } from "@/lib/wrapped/aggregate/schema"
import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"

import type { StatsContext, TitleKey } from "./keys"
import type { AggregateView } from "./metadata"
import { rankTitles } from "./rank"

const MIN_MEMBERS = 5

export type CommunityStats =
  | { eligible: false }
  | {
      eligible: true
      standing: { rank: number; members: number; percentile: number } | null
      /** Each listed series with 3 or more viewers on the server. */
      viewerRanks: Partial<Record<TitleKey, { rank: number; viewers: number }>>
      community: CommunityFacts
    }

function standing(view: AggregateView): Extract<CommunityStats, { eligible: true }>["standing"] {
  const watched = view.aggregate.members.filter((m) => m.minutes > 0)
  const own = watched.find((m) => m.userId === view.userId)
  if (!own || watched.length < MIN_MEMBERS) return null
  const rank = 1 + watched.filter((m) => m.minutes > own.minutes).length
  return { rank, members: watched.length, percentile: Math.ceil((rank / watched.length) * 100) }
}

/** A fact with fewer than 3 contributors is null. */
function published<T extends { contributors: number } | null>(fact: T): T | null {
  return fact && fact.contributors >= MIN_CONTRIBUTORS ? fact : null
}

/**
 * @example
 * ```ts
 * const community = computeCommunity(events, ctx, { userId, aggregate })
 * if (community.eligible) community.standing // { rank: 3, members: 31, percentile: 10 }
 * ```
 */
export function computeCommunity(events: readonly PlayEvent[], ctx: StatsContext, view: AggregateView | null): CommunityStats {
  if (!view) return { eligible: false }
  const viewerRanks: Partial<Record<TitleKey, { rank: number; viewers: number }>> = {}
  for (const series of rankTitles(events, ctx, "series")) {
    const title = view.aggregate.titles[series.key]
    if (!title || title.viewers < MIN_CONTRIBUTORS) continue
    viewerRanks[series.key] = { rank: 1 + title.minutes.filter((m) => m > series.minutes).length, viewers: title.viewers }
  }
  const { community } = view.aggregate
  return {
    eligible: true,
    standing: standing(view),
    viewerRanks,
    community: {
      hours: published(community.hours),
      topSeries: published(community.topSeries),
      busiestNight: published(community.busiestNight),
      peakConcurrent: published(community.peakConcurrent),
      requestsFulfilled: published(community.requestsFulfilled),
      titlesAdded: community.titlesAdded,
    },
  }
}
