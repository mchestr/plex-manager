/**
 * What the core pages' Notes (P8.4, FR-17) read besides a page's data and
 * facts, and the lines several of them share.
 *
 * @module lib/rewind/notes/context
 */

import { plain, type ArticleBlock } from "@/lib/rewind/article/blocks"
import type { CopyAuthor } from "@/lib/rewind/copy-disclosure"
import { shown } from "@/lib/rewind/pages/facts"
import type { NotesContext, RewindPageType } from "@/lib/rewind/registry"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

export interface CoreNotesContext extends NotesContext {
  /** `notes.core` (P8.4): off, the seven core pages keep their summary. */
  coreNotes?: boolean
  /** The quiz was answered or skipped in this session: the Guess Notes may name the answer. */
  quizAnswered?: boolean
  /** The selected list with each page's folio and name, for the cover's contents. */
  pages?: ReadonlyArray<{ folio: number; name: string; type: RewindPageType }>
  /** The member's earlier completed Rewind years, newest first, for the bookends. */
  earlierYears?: readonly number[]
  /** `serverName()`, the billing block's first credit. */
  serverName?: string
  copySource?: CopyAuthor["copySource"]
  /** The names of the cards the member can share (`eligibleCards`), for the back cover. */
  cards?: readonly string[]
}

/** A core page's Notes builder. */
export type CoreNotes<D> = (data: D, facts: RewindFactsV3, ctx: CoreNotesContext) => ArticleBlock[]

/** "January 1 to November 30": the issue's data window. */
export const windowRange = (facts: RewindFactsV3) => `${shown(facts, "window.from")} to ${shown(facts, "window.through")}`

export const headingBlock = (text: string): ArticleBlock => ({ kind: "heading", text: plain(text) })
export const paragraphBlock = (text: string): ArticleBlock => ({ kind: "paragraph", text: plain(text) })
