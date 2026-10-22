/**
 * The desktop Notes column's content (Rewind design 4.7, P7.4, P8.4).
 *
 * A page with a `notes()` builder extends itself there (Top shows' every
 * series, the calendar's days, the centrefold's "Why this?" and 24 hours).
 * With `notes.core` on, the seven other core pages use their builders in
 * this folder (P8.4, FR-17), kept outside the frozen page modules. Every
 * other page shows its deterministic `srSummary` as a paragraph (F11).
 * Built on the server with the page, so the client stage only renders blocks.
 *
 * @module lib/rewind/notes
 */

import type { ArticleBlock } from "@/lib/rewind/article/blocks"
import { registry, type RewindPageType, type RegistryEntry } from "@/lib/rewind/registry"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { backCoverNotes } from "./back-cover"
import { bookendsNotes } from "./bookends"
import { clockNotes } from "./clock"
import type { CoreNotes, CoreNotesContext } from "./context"
import { coverNotes } from "./cover"
import { guessNotes } from "./guess"
import { numberNotes } from "./number"
import { topFilmsNotes } from "./top-films"

export type { CoreNotesContext } from "./context"

/** The seven core pages that had only their summary until P8.4. Data has passed each page's schema. */
const CORE_NOTES: Partial<Record<RewindPageType, CoreNotes<never>>> = {
  cover: coverNotes,
  number: numberNotes,
  bookends: bookendsNotes,
  guess: guessNotes,
  "top-films": topFilmsNotes,
  clock: clockNotes,
  "back-cover": backCoverNotes,
}

/** The Notes blocks of one selected page: its `notes()`, its core builder when `notes.core` is on, or its summary as a paragraph. */
export function pageNotes(page: { type: RewindPageType; data: unknown }, facts: RewindFactsV3, ctx: CoreNotesContext): ArticleBlock[] {
  const entry: RegistryEntry = registry[page.type]
  const core = ctx.coreNotes ? (CORE_NOTES[page.type] as CoreNotes<unknown> | undefined) : undefined
  const notes = entry.notes?.(page.data, facts, ctx) ?? core?.(page.data, facts, ctx)
  if (notes && notes.length > 0) return notes
  const summary = entry.srSummary(page.data, facts)
  return summary ? [{ kind: "paragraph", text: [{ kind: "text", text: summary }] }] : []
}

/**
 * The page's Notes once the quiz is answered or skipped, when they differ
 * from `pageNotes` (Guess, and a bookend that is the quiz's answer); null
 * otherwise, so the stage keeps one list.
 */
export function answeredNotes(page: { type: RewindPageType; data: unknown }, facts: RewindFactsV3, ctx: CoreNotesContext): ArticleBlock[] | null {
  if (!ctx.coreNotes) return null
  const before = pageNotes(page, facts, { ...ctx, quizAnswered: false })
  const after = pageNotes(page, facts, { ...ctx, quizAnswered: true })
  return JSON.stringify(before) === JSON.stringify(after) ? null : after
}
