/**
 * 07 Taste (design 4.3): the member's genres by minutes as a column of bars,
 * the dominant genre of each month as a 12-cell strip, and the decades their
 * titles were made in, with the median year marked. Genre names are the
 * server's own Plex tags.
 *
 * Omitted when genres cover under 60% of the listed minutes (P2.8's
 * `taste.eligible`). Without a month genre the strip drops out, and the
 * column and the decade strip stand alone. Its Table lists the genres with
 * their minutes and shares, then the decades.
 *
 * @module lib/rewind/pages/taste
 */

import { figure, heading, paragraph, tableBlock } from "@/lib/rewind/article/blocks"
import { formatCount, formatRewindDuration, pluralWord } from "@/lib/rewind/format"
import type { PageDefinition, PageTable } from "@/lib/rewind/registry"
import { headline } from "@/lib/wrapped/copy/templates"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { pageDeck } from "./deck"
import { has, shown } from "./facts"
import { TasteDataSchema, type TasteData } from "./taste.schema"

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const
/** Copy is English; summary counts follow it. */
const COPY_LOCALE = { locale: "en-US" }

export const genreFact = (i: number, field: "name" | "share") => `taste.genre[${i + 1}].${field}` as FactId
export const monthGenreFact = (month: number) => `taste.genreByMonth[${month}]` as FactId

/** The months (1-12) with a dominant genre; the strip prints only when there is one. */
export const genreMonths = (facts: RewindFactsV3): number[] => MONTHS.filter((m) => has(facts, monthGenreFact(m)))

const genreList = (data: TasteData, facts: RewindFactsV3) => data.genres.map((_g, i) => `${shown(facts, genreFact(i, "name"))} ${shown(facts, genreFact(i, "share"))}`)

function tasteSummary(data: TasteData, facts: RewindFactsV3): string {
  const parts = [`Genres by minutes watched: ${genreList(data, facts).join(", ")}.`]
  const months = genreMonths(facts)
  const top = shown(facts, genreFact(0, "name"))
  const led = months.filter((m) => shown(facts, monthGenreFact(m)) === top).length
  if (led > 0) parts.push(`${top} was the top genre in ${led} of ${months.length} ${months.length === 1 ? "month" : "months"}.`)
  if (data.decades.length > 0) {
    const titles = (n: number) => `${n} ${pluralWord(n, { one: "title", other: "titles" }, COPY_LOCALE)}`
    parts.push(`Titles by the decade they were made: ${data.decades.map((d) => `${d.decade}s, ${titles(d.titles)}`).join("; ")}.`)
  }
  if (has(facts, "taste.medianYear")) parts.push(`The median year was ${shown(facts, "taste.medianYear")}.`)
  return parts.join(" ")
}

function tasteTable(data: TasteData, facts: RewindFactsV3, settings: { locale: string }): PageTable {
  return {
    caption: `Genres by minutes watched, from ${shown(facts, "window.from")} to ${shown(facts, "window.through")}, then titles by the decade they were made.`,
    columns: ["Genre or decade", "Watched", "Share"],
    rows: [
      ...data.genres.map((g, i) => [shown(facts, genreFact(i, "name")), formatRewindDuration(g.minutes, settings), shown(facts, genreFact(i, "share"))]),
      ...data.decades.map((d) => [`${d.decade}s`, formatCount(d.titles, { one: "title", other: "titles" }, settings), ""]),
    ],
  }
}

export const tastePage: PageDefinition<TasteData> = {
  select: (_facts, { stats }) => {
    const { taste } = stats
    if (!taste.eligible || taste.genres.length === 0) return null
    return { genres: taste.genres.map((g) => ({ minutes: g.minutes })), decades: [...taste.decades].sort((a, b) => b.decade - a.decade) }
  },
  schema: TasteDataSchema,
  srSummary: tasteSummary,
  table: tasteTable,
  article: (data, facts, ctx) => [
    heading(headline("taste", facts), facts),
    paragraph(pageDeck(ctx, facts, "taste"), facts),
    ...figure(tasteSummary(data, facts)),
    ...tableBlock(tasteTable(data, facts, ctx)),
  ],
  share: { facts: [0, 1, 2, 3, 4].flatMap((i) => [genreFact(i, "name"), genreFact(i, "share")]).concat("taste.medianYear") },
}
