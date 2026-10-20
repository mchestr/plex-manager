/**
 * The member's edition and the pages of their issue (design 4.3, 4.5, FR-5).
 *
 * ## Edition
 *
 * | Edition | Who | Pages |
 * |---|---|---|
 * | postcard | under 30 minutes, or 0 counted plays | 1 (the cover, until P7.3 draws the postcard) |
 * | pocket | under 5 hours, under 10 plays, or under 10 eligible pages | cover, number, short list, clock or calendar, centrefold, back cover |
 * | full | everyone else | every eligible page, in issue order |
 *
 * Pocket and postcard copy is template-only (zero LLM calls, RWP-19).
 *
 * ## Page rules
 *
 * | Page | Kept when |
 * |---|---|
 * | 03 Bookends | the first and last plays are not the same title on the same day |
 * | 04 Guess | the quiz is on (`quiz.gapMinutes`: 3 candidates, No. 1 more than 2% ahead, D7) |
 * | 05, 06 | there is a series, a film |
 * | 07, 08 | Taste (60% genre coverage), People (70% cast coverage) |
 * | 09 The clock | more than 10 counted plays |
 * | 11 The race | the race is eligible |
 * | 12 Records | 2 of 4 cells: a binge of 3+, a day of 3+ episodes, completion over 5+ started, a paused title |
 * | 13 Setup | 20 plays (Setup is eligible) |
 * | 14 Requests | one request or more |
 * | 15 Standing | 5 members with a Rewind |
 * | 17 Next year | a series left for later or a pick |
 *
 * 01, 02, 10, 16 and 18 are always kept. These are the rules P2.16's goldens
 * pin; P5.5's registry `select()` reproduces them and replaces
 * {@link selectIssuePages} with `selectPages`, which also stores each page's
 * data. Until then a page's `data` is null.
 *
 * @module lib/wrapped/pipeline/edition
 */

import { issuePages, type IssuePageType } from "@/lib/rewind/registry"
import { isPostcard } from "@/lib/wrapped/archetypes/select"
import type { PageType } from "@/lib/wrapped/data/page-types"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import type { MemberStats } from "@/lib/wrapped/stats/compute"

export type Edition = "full" | "pocket" | "postcard"

const POCKET_MINUTES = 5 * 60
const POCKET_PLAYS = 10
const FULL_PAGES = 10
const ISSUE_PAGES = 18

type EditionStats = Pick<MemberStats, "totals" | "plays" | "bookends" | "devices">

/**
 * The folios (1 to 18) of the full-issue pages whose own rule fails,
 * whatever the edition.
 *
 * @example
 * ```ts
 * omittedPages(facts, stats) // [4] for the heavy fixture: its No. 1 leads by 1.5%
 * ```
 */
export function omittedPages(facts: RewindFactsV3, stats: EditionStats): number[] {
  const has = (id: keyof RewindFactsV3) => facts[id] !== undefined
  const cells = [
    has("records.longestBinge.episodes"),
    Number(facts["records.mostEpisodesDay"]?.value ?? 0) >= 3,
    has("records.completionShare"),
    has("records.mostPaused.title"),
  ].filter(Boolean).length
  const kept: Record<number, boolean> = {
    3: !stats.bookends.sameTitleSameDay,
    4: has("quiz.gapMinutes"),
    5: has("series[1].title"),
    6: has("films[1].title"),
    7: has("taste.genre[1].name"),
    8: has("people.actor[1].name") || has("people.director[1].name"),
    9: stats.plays > 10,
    11: has("race.leadChanges"),
    12: cells >= 2,
    13: stats.devices.eligible,
    14: has("requests.made"),
    15: has("standing.members"),
    17: has("next.leftForLater[1].title") || has("next.picks[1].title"),
  }
  return Object.entries(kept)
    .filter(([, ok]) => !ok)
    .map(([page]) => Number(page))
}

/** The edition for the member's stats and omitted pages (FR-5). */
export function editionOf(stats: Pick<MemberStats, "totals" | "plays">, omitted: readonly number[]): Edition {
  if (isPostcard(stats)) return "postcard"
  const light = stats.totals.totalMinutes < POCKET_MINUTES || stats.plays < POCKET_PLAYS
  return light || ISSUE_PAGES - omitted.length < FULL_PAGES ? "pocket" : "full"
}

export interface IssuePage {
  type: PageType
  data: null
}

/**
 * The issue's pages in order. `disabledPages` (`Config.rewindDisabledPages`)
 * drops full-issue pages; the cover, the centrefold and the back cover always
 * stay.
 */
export function selectIssuePages(
  edition: Edition,
  omitted: readonly number[],
  disabledPages: readonly string[]
): IssuePage[] {
  const kept = new Set<IssuePageType>(
    issuePages.map((p) => p.type).filter((_, i) => !omitted.includes(i + 1))
  )
  const page = (type: PageType): IssuePage => ({ type, data: null })
  if (edition === "postcard") return [page("cover")]
  if (edition === "pocket") {
    const types: PageType[] = ["cover", "number"]
    if (kept.has("top-shows") || kept.has("top-films")) types.push("short-list")
    types.push(kept.has("clock") ? "clock" : "calendar", "centrefold", "back-cover")
    return types.map(page)
  }
  const fixed = new Set<string>(["cover", "centrefold", "back-cover"])
  return [...kept].filter((type) => fixed.has(type) || !disabledPages.includes(type)).map(page)
}
