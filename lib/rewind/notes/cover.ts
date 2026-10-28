/**
 * 01 Cover's Notes (P8.4): the contents with folios, the data window and
 * what the serial is for.
 *
 * @module lib/rewind/notes/cover
 */

import { plain } from "@/lib/rewind/article/blocks"
import { has, isWholeYear, shown } from "@/lib/rewind/pages/facts"
import type { CoverData } from "@/lib/rewind/pages/cover.schema"

import { headingBlock, paragraphBlock, windowRange, type CoreNotes } from "./context"

export const coverNotes: CoreNotes<CoverData> = (_data, facts, ctx) => {
  const pages = ctx.pages ?? []
  const window = isWholeYear(facts) ? `The whole year, ${windowRange(facts)}.` : `Data from ${windowRange(facts)}.`
  return [
    headingBlock("In this issue"),
    ...(pages.length > 0
      ? [{ kind: "rankedList" as const, label: "Contents", items: pages.map((page) => ({ rank: page.folio, title: page.name })) }]
      : []),
    paragraphBlock(window),
    ...(has(facts, "member.serial")
      ? [{ kind: "paragraph" as const, text: plain(`No. ${shown(facts, "member.serial")} links your cards without naming you.`) }]
      : []),
  ]
}
