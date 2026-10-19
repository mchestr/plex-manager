/**
 * Picks the member's archetype in code (design 7.6).
 *
 * ## Process
 *
 * 1. **Gates.** Under 30 minutes or with no counted play, the member gets the
 *    postcard and no archetype. Under 5 hours or 10 counted plays, only the
 *    low-volume shortlist (Casual Critic, Curator, Explorer, Comfort
 *    Rewatcher) is eligible. Casual Critic needs 1 hour.
 * 2. **Rank.** Eligible archetypes rank by score; equal scores follow the
 *    fixed tie-break order. When every eligible score is 0 the order would
 *    hand everyone the same archetype, so `hash(userId, year)` picks the
 *    first instead.
 * 3. **Shortlist.** The top 3 go to the LLM, which may choose among them
 *    only when they are within 5 points (`llmMayChoose`); otherwise code's
 *    first choice stands. The runner-up is the second.
 * 4. **Rarity** comes from the aggregate's counts, and only with 10 or more
 *    scored members; it is null otherwise.
 *
 * @module lib/wrapped/archetypes/select
 */

import { createHash } from "node:crypto"

import { MIN_SCORED_MEMBERS } from "@/lib/wrapped/aggregate/schema"
import type { FactId } from "@/lib/wrapped/facts/catalogue"
import type { MemberStats } from "@/lib/wrapped/stats/compute"

import { ARCHETYPE_IDS, LOW_VOLUME_SHORTLIST, TIE_BREAK_ORDER, type ArchetypeId } from "./catalogue"
import { scoreArchetypes } from "./scorers"

const POSTCARD_MINUTES = 30
const LOW_HOURS_MINUTES = 5 * 60
const LOW_PLAYS = 10
const CASUAL_MINUTES = 60
const SHORTLIST = 3
const LLM_WINDOW = 5

export interface ArchetypeSelection {
  id: ArchetypeId
  runnerUp: ArchetypeId | null
  evidence: FactId[]
  /** The top 3, best first. */
  shortlist: Array<{ id: ArchetypeId; score: number }>
  /** The top 3 are within 5 points, so the LLM may pick among them. */
  llmMayChoose: boolean
  /** "6 of 31 Rewinds"; null under 10 scored members. */
  rarity: { count: number; of: number } | null
}

/** The aggregate's archetype counts; null before it exists. */
export interface ArchetypeCounts {
  archetypeCounts: Partial<Record<ArchetypeId, number>> | null
  scoredMembers: number
}

/** Whether the member gets the postcard, which has no archetype. */
export function isPostcard(stats: Pick<MemberStats, "totals" | "plays">): boolean {
  return stats.totals.totalMinutes < POSTCARD_MINUTES || stats.plays === 0
}

function seed(userId: string, year: number): number {
  return parseInt(createHash("sha256").update(`${userId}:${year}`).digest("hex").slice(0, 8), 16)
}

/**
 * @returns null for a postcard member
 *
 * @example
 * ```ts
 * const pick = selectArchetype(stats, { userId, year: 2026, counts: aggregate })
 * pick?.id       // "midnight-marathoner"
 * pick?.evidence // ["hours.afterDarkShare", "hours.peak", "hours.quietest"]
 * pick?.rarity   // { count: 6, of: 31 }
 * ```
 */
export function selectArchetype(
  stats: MemberStats,
  { userId, year, counts }: { userId: string; year: number; counts: ArchetypeCounts | null }
): ArchetypeSelection | null {
  if (isPostcard(stats)) return null
  const low = stats.totals.totalMinutes < LOW_HOURS_MINUTES || stats.plays < LOW_PLAYS
  const eligible = (low ? LOW_VOLUME_SHORTLIST : ARCHETYPE_IDS).filter(
    (id) => id !== "casual-critic" || stats.totals.totalMinutes >= CASUAL_MINUTES
  )
  const scores = scoreArchetypes(stats)
  const ranked = [...eligible].sort((a, b) => scores[b].score - scores[a].score || TIE_BREAK_ORDER.indexOf(a) - TIE_BREAK_ORDER.indexOf(b))
  if (scores[ranked[0]].score === 0) {
    const [first] = ranked.splice(seed(userId, year) % ranked.length, 1)
    ranked.unshift(first)
  }

  const shortlist = ranked.slice(0, SHORTLIST).map((id) => ({ id, score: scores[id].score }))
  const id = ranked[0]
  const rarity =
    counts?.archetypeCounts && counts.scoredMembers >= MIN_SCORED_MEMBERS
      ? { count: counts.archetypeCounts[id] ?? 0, of: counts.scoredMembers }
      : null
  return {
    id,
    runnerUp: ranked[1] ?? null,
    evidence: scores[id].evidence,
    shortlist,
    llmMayChoose: shortlist.length > 1 && shortlist[0].score - shortlist[shortlist.length - 1].score <= LLM_WINDOW,
    rarity,
  }
}
