/**
 * 06 Top films (design 4.3): the member's films by plays, then minutes. The
 * No. 1 sits in a ticket stub in full colour, rows 2 to 5 are duotoned, and
 * rewatches print as "x2". Fewer than 3 films make a single feature; no
 * films omit the page.
 *
 * @module lib/rewind/pages/top-films
 */

import type { PageDefinition } from "@/lib/rewind/registry"
import type { FactId } from "@/lib/wrapped/facts/catalogue"

import { shown } from "./facts"
import { TopFilmsDataSchema, type TopFilmsData } from "./top-lists.schema"
import { filmFact } from "./top-shows"

/** Under this many films the page is a single feature. */
export const FILM_LIST_MIN = 3

export const topFilmsPage: PageDefinition<TopFilmsData> = {
  select: (_facts, { stats }) => {
    const films = stats.titles.films
    return films.length === 0 ? null : { rows: films.map((f) => ({ key: f.key })) }
  },
  schema: TopFilmsDataSchema,
  srSummary: (data, facts) => {
    const rows = data.rows.map((_row, i) => `${shown(facts, filmFact(i, "title"))}, ${shown(facts, filmFact(i, "minutes"))}`)
    return rows.length === 1 ? `Your film of the year: ${rows[0]}.` : `Your top films: ${rows.join("; ")}.`
  },
  table: (data, facts) => ({
    caption: `Your films by plays, from ${shown(facts, "window.from")} to ${shown(facts, "window.through")}.`,
    columns: ["Film", "Plays", "Watched"],
    rows: data.rows.map((_row, i) => [shown(facts, filmFact(i, "title")), shown(facts, filmFact(i, "plays")), shown(facts, filmFact(i, "minutes"))]),
  }),
  share: {
    facts: [1, 2, 3, 4, 5].flatMap((n) => [`films[${n}].title`, `films[${n}].plays`] as FactId[]),
    titles: [1, 2, 3, 4, 5].map((n) => `films[${n}].title` as FactId),
    art: true,
  },
}
