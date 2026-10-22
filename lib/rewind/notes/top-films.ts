/**
 * 06 Top films' Notes (P8.4): every listed film in a table with its plays
 * and minutes, and how many of the year's films were finished.
 *
 * The stored page lists the top five films and no per-film finish, so the
 * finish is the year's `films.finishedShare`; a fuller list needs a
 * regeneration, which the freeze rules out (P8 header).
 *
 * @module lib/rewind/notes/top-films
 */

import type { ArticleBlock } from "@/lib/rewind/article/blocks"
import { formatHero } from "@/lib/rewind/format"
import { has, shown } from "@/lib/rewind/pages/facts"
import { ratingKeyOf } from "@/lib/rewind/pages/title-key"
import type { TopFilmsData } from "@/lib/rewind/pages/top-lists.schema"
import { filmFact } from "@/lib/rewind/pages/top-shows"

import { headingBlock, paragraphBlock, windowRange, type CoreNotes } from "./context"

export const topFilmsNotes: CoreNotes<TopFilmsData> = (data, facts, ctx) => {
  const rows = data.rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => !ctx.hiddenKeys?.has(ratingKeyOf(row.key)))
    .map(({ i }, n) => [formatHero(n + 1, ctx), shown(facts, filmFact(i, "title")), shown(facts, filmFact(i, "plays")), shown(facts, filmFact(i, "minutes"))])
  if (rows.length === 0) return []
  const blocks: ArticleBlock[] = [
    headingBlock(rows.length === 1 ? "Your one film" : "Your films, ranked by plays"),
    paragraphBlock(`Ranked by plays, then minutes, from ${windowRange(facts)}. A rewatch is a second play.`),
    { kind: "table", table: { caption: "Your films by plays.", columns: ["No.", "Film", "Plays", "Watched"], rows } },
  ]
  if (has(facts, "films.finishedShare")) {
    blocks.push(paragraphBlock(`You finished ${shown(facts, "films.finishedShare")} of the films you started this year.`))
  }
  return blocks
}
