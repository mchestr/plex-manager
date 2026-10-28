/**
 * Short list (design 4.5, `pocket-short-list.png`): the pocket edition's
 * page in place of 05 Top shows and 06 Top films. Films and series merge into
 * the top 3 titles of any type, ranked by `rank.ts`'s one order (minutes,
 * then plays, then the title), read off the stored facts.
 *
 * The rows come from the same title keys Top shows and Top films hold, so the
 * page is derived at render time for a full issue's pocket cut
 * (`lib/rewind/editions.ts`) exactly as the pipeline stores it for a pocket
 * member. The facts carry no last-watched time, so two titles tied on
 * minutes and plays fall back to the title, on both paths alike.
 *
 * @module lib/rewind/pages/short-list
 */

import { heading, paragraph } from "@/lib/rewind/article/blocks"
import type { PageDefinition } from "@/lib/rewind/registry"
import { shortListDeck, shortListHeadline } from "@/lib/wrapped/copy/templates"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import { compareRanked } from "@/lib/wrapped/stats/rank"

import { has, num, shown } from "./facts"
import { ShortListDataSchema, type ShortListData, type ShortListRow } from "./short-list.schema"
import { ratingKeyOf } from "./title-key"

/** Titles on the Short list. */
const SHORT_LIST_LENGTH = 3
/** Rows each list's facts cover (`series[1..5]`, `films[1..5]`). */
const LISTED = 5

/** A row's fact: `films[rank].minutes` for a film, `series[rank].minutes` for a series. */
export const shortListFact = (row: ShortListRow, field: string) => `${row.key.startsWith("film:") ? "films" : "series"}[${row.rank}].${field}` as FactId

const isFilm = (row: ShortListRow) => row.key.startsWith("film:")

/**
 * The Short list from each list's title keys in their own rank order (Top
 * shows' and Top films' rows), or null when neither list has a title.
 *
 * @example
 * ```ts
 * shortListRows([{ key: "series:77" }], [{ key: "film:9" }], facts)
 * // { rows: [{ key: "series:77", rank: 1 }, { key: "film:9", rank: 1 }] } when the series has more minutes
 * ```
 */
export function shortListRows(series: ReadonlyArray<{ key: string }>, films: ReadonlyArray<{ key: string }>, facts: RewindFactsV3): ShortListData | null {
  const rows: ShortListRow[] = [
    ...series.slice(0, LISTED).map((row, i) => ({ key: row.key, rank: i + 1 })),
    ...films.slice(0, LISTED).map((row, i) => ({ key: row.key, rank: i + 1 })),
  ].filter((row) => has(facts, shortListFact(row, "title")))
  const ranked = rows
    .map((row) => ({
      row,
      minutes: num(facts, shortListFact(row, "minutes")),
      plays: isFilm(row) ? num(facts, shortListFact(row, "plays")) : num(facts, shortListFact(row, "episodes")),
      lastWatched: 0,
      title: shown(facts, shortListFact(row, "title")),
    }))
    .sort(compareRanked)
    .slice(0, SHORT_LIST_LENGTH)
  return ranked.length === 0 ? null : { rows: ranked.map((r) => r.row) }
}

/** "your most-watched film" or "series". */
export const shortListKind = (row: ShortListRow) => (isFilm(row) ? "film" : "series")

export const shortListPage: PageDefinition<ShortListData> = {
  select: (facts, { stats }) => shortListRows(stats.titles.series, stats.titles.films, facts),
  schema: ShortListDataSchema,
  srSummary: (data, facts) => {
    const rows = data.rows.map((row, i) => `${i + 1}, ${shown(facts, shortListFact(row, "title"))}, ${shortListKind(row)}, ${shown(facts, shortListFact(row, "minutes"))}`)
    return `Your short list: ${rows.join("; ")}.`
  },
  article: (data, facts, ctx) => [
    heading(shortListHeadline(data.rows.length), facts),
    paragraph(shortListDeck(ctx.edition), facts),
    {
      kind: "rankedList",
      label: "Your short list",
      items: data.rows.map((row, i) => ({ rank: i + 1, title: shown(facts, shortListFact(row, "title")), detail: shown(facts, shortListFact(row, "minutes")) })),
    },
  ],
  // The Short list card (P7.6) prints its own rows: each title with its minutes.
  share: {
    facts: (["series", "films"] as const).flatMap((list) => [1, 2, 3, 4, 5].flatMap((n) => [`${list}[${n}].title`, `${list}[${n}].minutes`] as FactId[])),
    titles: (["series", "films"] as const).flatMap((list) => [1, 2, 3, 4, 5].map((n) => `${list}[${n}].title` as FactId)),
    art: true,
    titleKeys: ({ rows }) => Object.fromEntries(rows.map((row) => [shortListFact(row, "title"), ratingKeyOf(row.key)])),
    pick: ({ rows }) => rows.flatMap((row) => [shortListFact(row, "title"), shortListFact(row, "minutes")]),
  },
}
