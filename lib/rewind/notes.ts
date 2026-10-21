/**
 * The desktop Notes column's content (Rewind design 4.7, P7.4).
 *
 * A page with a `notes()` builder extends itself there (Top shows' every
 * series, the calendar's days, the centrefold's "Why this?" and 24 hours);
 * every other page shows its deterministic `srSummary` as a paragraph (F11).
 * Built on the server with the page, so the client stage only renders blocks.
 *
 * @module lib/rewind/notes
 */

import type { ArticleBlock } from "@/lib/rewind/article/blocks"
import { CARD_PAGE_TYPES } from "@/lib/rewind/cards/eligible"
import { registry, SHARE_PAGE_TYPES, type IssuePageType, type NotesContext, type RegistryEntry } from "@/lib/rewind/registry"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

/** The Notes blocks of one selected page: its `notes()`, or its summary as a paragraph. */
export function pageNotes(page: { type: IssuePageType; data: unknown }, facts: RewindFactsV3, ctx: NotesContext): ArticleBlock[] {
  const entry: RegistryEntry = registry[page.type]
  const notes = entry.notes?.(page.data, facts, ctx)
  if (notes && notes.length > 0) return notes
  const summary = entry.srSummary(page.data, facts)
  return summary ? [{ kind: "paragraph", text: [{ kind: "text", text: summary }] }] : []
}

const CARDS: ReadonlySet<string> = new Set(CARD_PAGE_TYPES)
const SHAREABLE: ReadonlySet<string> = new Set(SHARE_PAGE_TYPES)

/**
 * The share formats line at the foot of the Notes, or null on a page that
 * offers no card (Setup, Next year). Pages without a card yet share a link.
 *
 * @example
 * ```ts
 * shareFormats("top-shows") // "Story card, 1080 by 1920"
 * shareFormats("setup")     // null
 * ```
 */
export function shareFormats(type: IssuePageType): string | null {
  if (CARDS.has(type)) return "Story card, 1080 by 1920"
  return SHAREABLE.has(type) ? "A link to your shared Rewind" : null
}
