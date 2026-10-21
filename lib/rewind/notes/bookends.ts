/**
 * 03 Bookends' Notes (P8.4): the first and last plays with their date, time
 * and zone, and the member's earlier Rewind years. A bookend the page masks
 * (it is the quiz's answer) stays masked until the quiz is answered.
 *
 * @module lib/rewind/notes/bookends
 */

import type { Route } from "next"

import type { ArticleBlock } from "@/lib/rewind/article/blocks"
import type { BookendsData } from "@/lib/rewind/pages/bookends.schema"
import { has, shown } from "@/lib/rewind/pages/facts"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { headingBlock, zoneNote, type CoreNotes, type CoreNotesContext } from "./context"

const MASK = "Your No. 1 (the quiz comes first)"

function bookend(facts: RewindFactsV3, end: "first" | "last", masked: boolean, ctx: CoreNotesContext) {
  const id = (field: string) => `bookends.${end}.${field}` as FactId
  if (!has(facts, id("title"))) return []
  const title = masked && !ctx.quizAnswered ? MASK : shown(facts, id("title"))
  return [{ term: end === "first" ? "First play" : "Last play", detail: [{ kind: "text" as const, text: `${title}, ${shown(facts, id("date"))} at ${shown(facts, id("time"))}` }] }]
}

export const bookendsNotes: CoreNotes<BookendsData> = (data, facts, ctx) => {
  const entries = [...bookend(facts, "first", data.first.masked, ctx), ...bookend(facts, "last", data.last.masked, ctx)]
  const years = ctx.earlierYears ?? []
  const blocks: ArticleBlock[] = [headingBlock("Where the year starts and ends")]
  if (entries.length > 0) blocks.push({ kind: "definitionList", label: "Bookends", entries }, zoneNote(facts, ctx))
  if (years.length > 0) {
    blocks.push({
      kind: "definitionList",
      label: "Your earlier Rewinds",
      entries: years.map((year) => ({ term: String(year), detail: [{ kind: "text", text: `Rewind ${year}` }], href: `/rewind/${year}` as Route })),
    })
  }
  return blocks
}
