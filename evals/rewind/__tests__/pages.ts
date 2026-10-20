/**
 * The pages a member's issue omits and the edition they get (design 4.3,
 * 4.5), for the golden facts test. The page rules are the registry's own
 * `select()` (P5.5), run before `Config.rewindDisabledPages` and the pages
 * still waiting for their step are removed; the goldens pin their output.
 */

import { issuePages } from "@/lib/rewind/registry"
import { eligiblePages } from "@/lib/rewind/select-pages"
import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"
import { isPostcard } from "@/lib/wrapped/archetypes/select"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import type { MemberStats } from "@/lib/wrapped/stats/compute"

const POCKET_MINUTES = 5 * 60
const POCKET_PLAYS = 10
const FULL_PAGES = 10

/** The 1-based numbers of the full-issue pages whose own rule fails. */
export function omittedPages(facts: RewindFactsV3, stats: MemberStats, archetype: ArchetypeId | null): number[] {
  const kept = new Set(eligiblePages(facts, { edition: "full", archetype, disabledPages: [], stats }).map((p) => p.type))
  return issuePages.flatMap((page, i) => (kept.has(page.type) ? [] : [i + 1]))
}

export function editionOf(stats: MemberStats, omitted: readonly number[]): "full" | "pocket" | "postcard" {
  if (isPostcard(stats)) return "postcard"
  const light = stats.totals.totalMinutes < POCKET_MINUTES || stats.plays < POCKET_PLAYS
  return light || 18 - omitted.length < FULL_PAGES ? "pocket" : "full"
}
