/**
 * 18 Back cover's Notes (P8.4): the billing block as a definition list, the
 * cards the member can share, and the privacy lines: who can view the
 * issue, the AI disclosure and how to report a problem.
 *
 * @module lib/rewind/notes/back-cover
 */

import { plain, type ArticleBlock } from "@/lib/rewind/article/blocks"
import { billingEntries } from "@/lib/rewind/billing-block"
import { backCoverDisclosure } from "@/lib/rewind/copy-disclosure"
import type { BackCoverData } from "@/lib/rewind/pages/back-cover.schema"

import { headingBlock, paragraphBlock, type CoreNotes } from "./context"

export const backCoverNotes: CoreNotes<BackCoverData> = (_data, facts, ctx) => {
  const entries = billingEntries(facts, {
    serverName: ctx.serverName ?? "",
    named: true,
    showtime: (ctx.pages ?? []).some((page) => page.type === "clock"),
    locale: ctx.locale,
  })
  const cards = ctx.cards ?? []
  const blocks: ArticleBlock[] = [headingBlock("The credits")]
  if (entries.length > 0) blocks.push({ kind: "definitionList", label: "Billing", entries: entries.map((entry) => ({ term: entry.term, detail: plain(entry.detail) })) })
  if (cards.length > 0) {
    blocks.push({ kind: "rankedList", label: cards.length === 1 ? "The card you can share" : `The ${cards.length} cards you can share`, items: cards.map((title, i) => ({ rank: i + 1, title })) })
  }
  blocks.push(
    headingBlock("Privacy"),
    paragraphBlock("Server admins can view your Rewind. Cards never show other members."),
    paragraphBlock(backCoverDisclosure(ctx.copySource ?? "template")),
    paragraphBlock("Something wrong? Report a problem to your server admin, or hide a title from your Rewind.")
  )
  return blocks
}
