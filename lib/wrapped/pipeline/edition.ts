/**
 * The member's edition and the pages of their issue (design 4.3, 4.5, FR-5).
 *
 * ## Edition
 *
 * | Edition | Who | Pages |
 * |---|---|---|
 * | postcard | under 30 minutes, or 0 counted plays | 1: the postcard |
 * | pocket | under 5 hours, under 10 plays, or under 10 eligible pages | cover, number, short list, clock or calendar (`habitPage`), centrefold, back cover |
 * | full | everyone else | every eligible page, in issue order |
 *
 * Pocket and postcard copy is template-only (zero LLM calls, RWP-19).
 *
 * ## Pages
 *
 * Each page's own rule is its registry `select()` (P5.5); `selectPages`
 * stores each kept page with its data, after `Config.rewindDisabledPages`
 * and the pages still waiting for their step are removed. The goldens
 * (P2.16) pin which full-issue pages fail their rule.
 *
 * @module lib/wrapped/pipeline/edition
 */

import { pocketTypes } from "@/lib/rewind/editions"
import { issuePages, registry, type RewindPageType } from "@/lib/rewind/registry"
import { eligiblePages, selectPages } from "@/lib/rewind/select-pages"
import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"
import { isPostcard } from "@/lib/wrapped/archetypes/select"
import type { PageType } from "@/lib/wrapped/data/page-types"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import type { MemberStats } from "@/lib/wrapped/stats/compute"

export type Edition = "full" | "pocket" | "postcard"

const POCKET_MINUTES = 5 * 60
const POCKET_PLAYS = 10
const FULL_PAGES = 10
const ISSUE_PAGES = 18

/**
 * The folios (1 to 18) of the full-issue pages whose own rule fails,
 * whatever the edition.
 *
 * @example
 * ```ts
 * omittedPages(facts, stats, archetype) // [4] for the heavy fixture: its No. 1 leads by 1.5%
 * ```
 */
export function omittedPages(facts: RewindFactsV3, stats: MemberStats, archetype: ArchetypeId | null): number[] {
  const kept = new Set(eligiblePages(facts, { edition: "full", archetype, disabledPages: [], stats }).map((p) => p.type))
  return issuePages.flatMap((page, i) => (kept.has(page.type) ? [] : [i + 1]))
}

/** The edition for the member's stats and omitted pages (FR-5). */
export function editionOf(stats: Pick<MemberStats, "totals" | "plays">, omitted: readonly number[]): Edition {
  if (isPostcard(stats)) return "postcard"
  const light = stats.totals.totalMinutes < POCKET_MINUTES || stats.plays < POCKET_PLAYS
  return light || ISSUE_PAGES - omitted.length < FULL_PAGES ? "pocket" : "full"
}

export interface IssuePage {
  type: PageType
  data: unknown
}

interface IssueContext {
  stats: MemberStats
  /** Seeds the quiz's option order per member. */
  userId: string
  archetype: ArchetypeId | null
  /** `Config.rewindDisabledPages`; the cover, the centrefold and the back cover always stay. */
  disabledPages: readonly string[]
}

const FIXED = new Set<string>(["cover", "centrefold", "back-cover"])

/** The issue's pages in order, each with its data. */
export function selectIssuePages(edition: Edition, facts: RewindFactsV3, ctx: IssueContext): IssuePage[] {
  if (edition === "full") {
    const disabledPages = ctx.disabledPages.filter((type) => !FIXED.has(type))
    return selectPages(facts, { ...ctx, edition, disabledPages }).map(({ type, data }) => ({ type, data }))
  }
  const select = { ...ctx, edition, disabledPages: [] }
  if (edition === "postcard") return [{ type: "postcard", data: registry.postcard.select(facts, select) }]
  const eligible = new Map<RewindPageType, unknown>(eligiblePages(facts, select).map((p) => [p.type, p.data]))
  const shortList = registry["short-list"].select(facts, select)
  return pocketTypes(facts, (type) => eligible.has(type), shortList !== null).map((type) => ({
    type,
    data: type === "short-list" ? shortList : eligible.get(type),
  }))
}
