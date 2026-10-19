/**
 * The aggregate's archetype counts and records medians (design 7.4): every
 * matched member is scored with `computeMemberStats` and `selectArchetype`,
 * the same calls their own Rewind makes, in their own zone and window and
 * with their hidden titles, so rarity can never disagree with the member's
 * archetype.
 *
 * A member on the postcard has no archetype and is not scored. Below 10
 * scored members both the counts and the medians are null, because nothing
 * smaller is shown.
 *
 * @module lib/wrapped/aggregate/archetypes
 */

import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"
import { selectArchetype, type ArchetypeSelection } from "@/lib/wrapped/archetypes/select"
import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { computeMemberStats, type MemberStats } from "@/lib/wrapped/stats/compute"
import type { StatsContext } from "@/lib/wrapped/stats/keys"
import type { MetadataLookup } from "@/lib/wrapped/stats/metadata"

import { MIN_SCORED_MEMBERS, type ServerAggregate, type ServerMedians } from "./schema"

export interface ScoredMemberInput {
  userId: string
  events: readonly PlayEvent[]
  ctx: StatsContext
  metadata: MetadataLookup | null
}

/** Each records cell, read off one member's stats; null when the member has none. */
const CELLS: Record<keyof ServerMedians, (stats: MemberStats) => number | null> = {
  longestBinge: (s) => s.sessions.longestBinge?.episodes ?? null,
  deepestBinge: (s) => s.sessions.deepestBinge?.episodes ?? null,
  mostEpisodesDay: (s) => s.sessions.mostEpisodesDay?.episodes ?? null,
  completionShare: (s) => s.titles.completion?.share ?? null,
  mostPaused: (s) => s.sessions.mostPaused?.minutes ?? null,
  biggestWeek: (s) => s.sessions.biggestWeek?.minutes ?? null,
}

/** The median; the mean of the two middle values on an even count. */
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * One member's stats and archetype, from the aggregate's inputs: no lifetime
 * pass, Overseerr, aggregate or library, none of which a scorer reads.
 *
 * @public The consistency test compares it with the member's own pick.
 */
export function scoreMember(member: ScoredMemberInput, year: number): { stats: MemberStats; pick: ArchetypeSelection | null } {
  const stats = computeMemberStats(member.events, member.ctx, {
    lifetime: null,
    metadata: member.metadata,
    requests: null,
    aggregate: null,
    library: null,
    excludedContentRatings: [],
  })
  return { stats, pick: selectArchetype(stats, { userId: member.userId, year, counts: null }) }
}

/**
 * @example
 * ```ts
 * scoreMembers(members, 2026) // { scoredMembers: 31, archetypeCounts: { "midnight-marathoner": 6, ... }, medians: { ... } }
 * ```
 */
export function scoreMembers(
  members: readonly ScoredMemberInput[],
  year: number
): Pick<ServerAggregate, "scoredMembers" | "archetypeCounts" | "medians"> {
  const counts: Partial<Record<ArchetypeId, number>> = {}
  const scored: MemberStats[] = []
  for (const member of members) {
    const { stats, pick } = scoreMember(member, year)
    if (!pick) continue
    counts[pick.id] = (counts[pick.id] ?? 0) + 1
    scored.push(stats)
  }

  if (scored.length < MIN_SCORED_MEMBERS) return { scoredMembers: scored.length, archetypeCounts: null, medians: null }
  const medians = Object.fromEntries(
    Object.entries(CELLS).map(([cell, read]) => [cell, median(scored.flatMap((s) => read(s) ?? []))])
  ) as ServerMedians
  return { scoredMembers: scored.length, archetypeCounts: counts, medians }
}
