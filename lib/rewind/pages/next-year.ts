/**
 * 17 Next year (design 4.3): "Unfinished business", a cinema-listings column
 * of the series left for later, the seasons returning (Sonarr) and three
 * picks from the library, each with a template reason ("Because you watched
 * ..."), so picks add no LLM slot.
 *
 * - Omitted when all three parts are empty. Third on the cut list: the keys
 *   `next-year.picks` and `next-year.returning` in `rewindDisabledPages` drop
 *   those parts first, and `next-year` the page.
 * - Titles link into the server's Plex web app; a returning season links to
 *   its Overseerr page when Overseerr is configured.
 * - No share card (FR-18).
 *
 * @module lib/rewind/pages/next-year
 */

import { andList, deckBlock, heading, plain, type ArticleBlock, type ArticleContext } from "@/lib/rewind/article/blocks"
import type { PageDefinition } from "@/lib/rewind/registry"
import { headline } from "@/lib/wrapped/copy/templates"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { pageDeck } from "./deck"
import { shown } from "./facts"
import { NextYearDataSchema, PICK_REASONS, type NextYearData } from "./next-year.schema"

/** The `rewindDisabledPages` keys that cut one part of the page (design 13.3); P7.12 lists them. @internal */
export const NEXT_YEAR_PARTS = { picks: "next-year.picks", returning: "next-year.returning" } as const

export type NextYearPart = "leftForLater" | "returning" | "picks"

/** Each part's heading in the listings. */
export const PART_HEADINGS: Record<NextYearPart, string> = {
  leftForLater: "Unfinished business",
  returning: "Returning",
  picks: "Picks for the new year",
}

/** The fact that names row `i` of a part. */
export const partTitle = (part: NextYearPart, i: number): FactId => `next.${part}[${i + 1}].title` as FactId

/** "Because you watched {{fact:people.actor[2].name}}": a pick's reason line. */
export const pickReason = (because: NextYearData["picks"][number]["because"]): string => `Because you watched {{fact:${because}}}`

/** The people fact whose display is `person`, else the top genre. */
function reasonFor(person: string | null, facts: RewindFactsV3): NextYearData["picks"][number]["because"] {
  const match = person === null ? undefined : PICK_REASONS.find((id) => id !== "taste.genre[1].name" && shown(facts, id) === person)
  return match ?? "taste.genre[1].name"
}

function nextYearSummary(data: NextYearData, facts: RewindFactsV3): string {
  const list = (part: NextYearPart, rows: readonly unknown[]) => rows.map((_row, i) => shown(facts, partTitle(part, i))).join(", ")
  const parts: string[] = []
  if (data.leftForLater.length > 0) parts.push(`Left for later: ${list("leftForLater", data.leftForLater)}.`)
  if (data.returning.length > 0) {
    parts.push(`Returning: ${data.returning.map((row, i) => `${shown(facts, partTitle("returning", i))} season ${row.season}, ${shown(facts, `next.returning[${i + 1}].date` as FactId)}`).join("; ")}.`)
  }
  if (data.picks.length > 0) parts.push(`Picks from the library: ${list("picks", data.picks)}.`)
  return parts.join(" ")
}

/** Article mode: each part with rows as one listing, its titles and a returning series' season and date, under a deck that names none of them again. */
function nextYearArticle(data: NextYearData, facts: RewindFactsV3, ctx: ArticleContext): ArticleBlock[] {
  const ids = (part: NextYearPart, rows: readonly unknown[]) => rows.map((_row, i) => partTitle(part, i))
  const named = (part: NextYearPart, rows: readonly unknown[]) => plain(andList(ids(part, rows).map((id) => shown(facts, id))))
  const dates = data.returning.map((_row, i) => `next.returning[${i + 1}].date` as FactId)
  const returning = data.returning.map((row, i) => `${shown(facts, partTitle("returning", i))} season ${row.season}, ${shown(facts, dates[i])}`)
  const entries = [
    ...(data.leftForLater.length > 0 ? [{ term: "Left for later", detail: named("leftForLater", data.leftForLater) }] : []),
    ...(returning.length > 0 ? [{ term: PART_HEADINGS.returning, detail: plain(returning.join("; ")) }] : []),
    ...(data.picks.length > 0 ? [{ term: PART_HEADINGS.picks, detail: named("picks", data.picks) }] : []),
  ]
  const printed = [...ids("leftForLater", data.leftForLater), ...ids("returning", data.returning), ...dates, ...ids("picks", data.picks)]
  return [heading(headline("next-year", facts), facts), ...deckBlock(pageDeck(ctx, facts, "nextYear"), facts, printed), { kind: "definitionList", entries }]
}

export const nextYearPage: PageDefinition<NextYearData> = {
  select: (facts, { stats, disabledPages }) => {
    const next = stats.nextYear
    const cut = (part: keyof typeof NEXT_YEAR_PARTS) => disabledPages.includes(NEXT_YEAR_PARTS[part])
    const data: NextYearData = {
      leftForLater: next.leftForLater.map(({ key, season, episode, lastWatched }) => ({ key, season, episode, lastWatched })),
      returning: cut("returning") ? [] : (next.returning ?? []).map(({ key, season, tmdbId }) => ({ key, season, tmdbId })),
      picks: cut("picks") ? [] : next.picks.map(({ ratingKey, kind, year, person }) => ({ ratingKey, kind, year, because: reasonFor(person, facts) })),
    }
    return data.leftForLater.length + data.returning.length + data.picks.length === 0 ? null : data
  },
  schema: NextYearDataSchema,
  srSummary: nextYearSummary,
  article: nextYearArticle,
  share: { facts: [] },
}
