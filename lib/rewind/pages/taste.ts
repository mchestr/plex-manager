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

import { deckBlock, heading, plain } from "@/lib/rewind/article/blocks"
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

/** The top genre and how many of the strip's months it led. */
function topGenreMonths(facts: RewindFactsV3) {
  const months = genreMonths(facts)
  const top = shown(facts, genreFact(0, "name"))
  return { top, led: months.filter((m) => shown(facts, monthGenreFact(m)) === top).length, of: `${months.length} ${months.length === 1 ? "month" : "months"}` }
}

function tasteSummary(data: TasteData, facts: RewindFactsV3): string {
  const parts = [`Genres by minutes watched: ${genreList(data, facts).join(", ")}.`]
  const { top, led, of } = topGenreMonths(facts)
  if (led > 0) parts.push(`${top} was the top genre in ${led} of ${of}.`)
  if (data.decades.length > 0) {
    const titles = (n: number) => `${n} ${pluralWord(n, { one: "title", other: "titles" }, COPY_LOCALE)}`
    parts.push(`Titles by the decade they were made: ${data.decades.map((d) => `${d.decade}s, ${titles(d.titles)}`).join("; ")}.`)
  }
  if (has(facts, "taste.medianYear")) parts.push(`The median year was ${shown(facts, "taste.medianYear")}.`)
  return parts.join(" ")
}

/**
 * Article mode's one line for the month strip and the decade strip: "Animation
 * led 3 of 11 months. Your busiest decade was the 2010s, with 35 titles." A
 * decade is named only when it leads the others with two titles or more.
 */
function tasteLine(data: TasteData, facts: RewindFactsV3): string | null {
  const { top, led, of } = topGenreMonths(facts)
  const [first, second] = [...data.decades].sort((a, b) => b.titles - a.titles)
  const busiest = first && first.titles >= 2 && (!second || second.titles < first.titles) ? first : null
  const parts = [
    led > 0 && `${top} led ${led} of ${of}.`,
    busiest && `Your busiest decade was the ${busiest.decade}s, with ${formatCount(busiest.titles, { one: "title", other: "titles" }, COPY_LOCALE)}.`,
  ].filter((part): part is string => typeof part === "string")
  return parts.length > 0 ? parts.join(" ") : null
}

function tasteTable(data: TasteData, facts: RewindFactsV3, settings: { locale: string }): PageTable {
  return {
    caption: "Genres by minutes watched, then titles by the decade they were made.",
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
  // The genre shares and one line for both strips; the decade counts and genre minutes stay in the Table sheet.
  article: (data, facts, ctx) => {
    const line = tasteLine(data, facts)
    const genres = data.genres.map((_g, i) => [shown(facts, genreFact(i, "name")), shown(facts, genreFact(i, "share"))])
    return [
      heading(headline("taste", facts), facts),
      ...deckBlock(pageDeck(ctx, facts, "taste"), facts, data.genres.flatMap((_g, i) => [genreFact(i, "name"), genreFact(i, "share")]).concat("taste.medianYear")),
      ...(line ? [{ kind: "paragraph" as const, text: plain(line) }] : []),
      { kind: "table", table: { caption: "Your top genres", columns: ["Genre", "Share"], rows: genres } },
    ]
  },
  share: { facts: [0, 1, 2, 3, 4].flatMap((i) => [genreFact(i, "name"), genreFact(i, "share")]).concat("taste.medianYear") },
}
