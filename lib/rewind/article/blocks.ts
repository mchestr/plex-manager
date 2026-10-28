/**
 * Article mode's blocks (P5.12): the whole issue as one semantic document.
 *
 * ## Overview
 *
 * Each registry entry's `article(data, facts, ctx)` turns a selected page
 * into a list of `ArticleBlock`s, built from the same data, `table()`
 * builders and `renderCopy` segments as its story page, so the two can never
 * show different numbers. `ArticleDocument`
 * (`components/rewind/article/article-document.tsx`) renders the blocks;
 * P7.13's legacy adapter maps stored v1 and v2 sections onto the same blocks.
 *
 * | Block | Renders as |
 * |---|---|
 * | `heading` | the page's headline, an `h3` under the section's `h2` |
 * | `paragraph` | a deck, a tagline or any running text |
 * | `factRow` | a row of key figures, value first ("586 episodes") |
 * | `rankedList` | an `ol` whose items keep their rank or folio |
 * | `table` | a captioned table with scoped headers (P5.3's contract) |
 * | `definitionList` | a `dl`, such as the billing block; an entry with `href` links its detail |
 * | `figure` | a graphic's `srSummary` text |
 * | `note` | small print: a caption, the colophon |
 * | `calendar` | the month tables, then P8.3's roving-focus grid once hydrated |
 *
 * Text that can hold facts is `ArticleText`: `renderCopy` segments, where a
 * token is set as a number and a title in italics with `dir="auto"`.
 *
 * @module lib/rewind/article/blocks
 */

import type { Route } from "next"

import type { RewindFeatureFlags } from "@/lib/rewind/features"
import type { CalendarDayRow } from "@/lib/rewind/pages/calendar"
import type { Edition, PageTable, RewindPageType } from "@/lib/rewind/registry"
import type { FontMetrics } from "@/lib/rewind/typeset/measure"
import { renderCopy, type CopySegment, type TokenSource } from "@/lib/wrapped/copy/render-copy"
import type { RewindCopyV3Wire } from "@/lib/wrapped/copy/schema"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

/** Text with its facts filled in: `renderCopy` segments. */
export type ArticleText = CopySegment[]

export type ArticleBlock =
  | { kind: "heading"; text: ArticleText }
  | { kind: "paragraph"; text: ArticleText }
  | { kind: "factRow"; items: Array<{ value: string; label: string }> }
  | { kind: "rankedList"; label: string; items: Array<{ rank: number; title: string; detail?: string }> }
  | { kind: "table"; table: PageTable }
  | { kind: "definitionList"; label?: string; entries: Array<{ term: string; detail: ArticleText; href?: Route }> }
  | { kind: "figure"; summary: string }
  | { kind: "note"; text: ArticleText }
  /**
   * The calendar's days as P8.3's roving-focus grid (`calendar.grid` on):
   * `tables` are P5.12's month tables, which the server renders and which
   * read without JavaScript; `months` are the grid's rows once it hydrates.
   */
  | { kind: "calendar"; caption: string; tables: PageTable[]; months: CalendarGridMonth[] }

/** One row of the calendar grid: a month and each of its days in the window. */
export interface CalendarGridMonth {
  /** "July". */
  label: string
  days: CalendarDayRow[]
}

/** @internal The legacy contract test covers every kind but `calendar`, which only a v3 issue's calendar emits. */
export type ArticleBlockKind = ArticleBlock["kind"]

/** What a page's article reads besides its data and facts: the issue around it. P5.5's `IssueContext` satisfies it. */
export interface ArticleContext {
  year: number
  userId: string
  locale: string
  serverName: string
  edition: Edition
  /** The selected list, for folios and cover lines. */
  pages: ReadonlyArray<{ type: RewindPageType; folio: number }>
  copy: RewindCopyV3Wire | null
  copySource: RewindDataV3["copySource"]
  model: string | null
  /** The page font metrics (`pageMetrics`), passed in so no page module imports the server-only JSON. */
  metrics: FontMetrics
  /** The December features (P8.3); the calendar reads `calendar.grid`. */
  features?: Partial<RewindFeatureFlags>
}

/** Plain text, with no facts. */
export const plain = (text: string): ArticleText => [{ kind: "text", text }]

/** Token copy, rendered against the facts (and any template locals). */
export const copyText = (text: string, source: TokenSource): ArticleText => renderCopy(text, source)

export const heading = (text: string, source: TokenSource): ArticleBlock => ({ kind: "heading", text: copyText(text, source) })
export const paragraph = (text: string, source: TokenSource): ArticleBlock => ({ kind: "paragraph", text: copyText(text, source) })
export const figure = (summary: string): ArticleBlock[] => (summary ? [{ kind: "figure", summary }] : [])

/** A page's Table as a block, or nothing when the page has none. */
export const tableBlock = (table: PageTable | null | undefined): ArticleBlock[] => (table ? [{ kind: "table", table }] : [])

/** The plain text of article text. @internal */
export const textOf = (text: ArticleText): string => text.map((segment) => segment.text).join("")
