/**
 * The page registry: what each page of a Rewind 2026 issue is (design 4.2).
 *
 * Every surface that names, orders, colours or times a page reads it here:
 * the folio, progress label, Contents, cover lines, the back-cover index and
 * the RewindCard's "18 pages, about 2 min 20 s". Entries are in issue order.
 *
 * ## What an entry owns (P5.5)
 *
 * - `select(facts, ctx)` returns the page's data, or null when the page has
 *   nothing to say, so the page omits itself (FR-2). Page data holds fact
 *   ids, rating keys and geometry inputs, never a second copy of a number a
 *   fact displays.
 * - `schema` is the strict Zod schema of that data, in
 *   `lib/rewind/pages/<page>.schema.ts`; a stored page is parsed with it on
 *   read (`validatePagesOnRead`).
 * - `srSummary(data, facts)` is the deterministic text a screen reader, the
 *   desktop Notes and article mode read for the page's graphic.
 * - `table(data, facts, settings)` is the chart pages' Table sheet (P5.3).
 * - `share.facts` are the facts the page's card may print (P5.10).
 * - `article(data, facts, ctx)` is the page in article mode (P5.12).
 *
 * Pages whose steps have not landed keep the page rule of design 4.3 as their
 * `select` with empty data (`lib/rewind/pages/rules.ts`); P5.7, P7.1 and P7.2
 * replace them page by page.
 *
 * ## Fields and the spot rule (design 5.3)
 *
 * `field` is a named ink, or `archetype` for the cover and centrefold. When a
 * colour page's field equals the member's archetype field, the page prints in
 * `altField` instead, so the centrefold colour stays special. `spot` is `arch`
 * on the cover and centrefold, `arch-deep` on paper pages, and `ink` on every
 * other colour page, which therefore prints in two inks.
 *
 * @module lib/rewind/registry
 */

import type { z } from "zod"

import type { InkName } from "@/lib/design/tokens"
import type { ArticleBlock, ArticleContext } from "@/lib/rewind/article/blocks"
import { backCoverPage } from "@/lib/rewind/pages/back-cover"
import { bookendsPage } from "@/lib/rewind/pages/bookends"
import { calendarPage } from "@/lib/rewind/pages/calendar"
import { centrefoldPage } from "@/lib/rewind/pages/centrefold"
import { clockPage } from "@/lib/rewind/pages/clock"
import { coverPage } from "@/lib/rewind/pages/cover"
import { guessPage } from "@/lib/rewind/pages/guess"
import { nextYearPage } from "@/lib/rewind/pages/next-year"
import { numberPage } from "@/lib/rewind/pages/number"
import { requestsPage } from "@/lib/rewind/pages/requests"
import { pendingPages } from "@/lib/rewind/pages/rules"
import { setupPage } from "@/lib/rewind/pages/setup"
import { standingPage } from "@/lib/rewind/pages/standing"
import { topFilmsPage } from "@/lib/rewind/pages/top-films"
import { topShowsPage } from "@/lib/rewind/pages/top-shows"
import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"
import type { PageType } from "@/lib/wrapped/data/page-types"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import type { MemberStats } from "@/lib/wrapped/stats/compute"

export type Act = "front" | "features" | "habits" | "server" | "centrefold" | "back"

/** The pages of the full issue; the pocket edition's `short-list` arrives in P7.3. */
export type IssuePageType = Exclude<PageType, "short-list">

export type Edition = "full" | "pocket" | "postcard"

/**
 * Autoplay hold in ms, or how the page waits instead: `tap` (the cover waits
 * for a cut), `hold` (the guess waits for an answer), `end` (the back cover).
 */
export type Dwell = number | "tap" | "hold" | "end"

/**
 * A chart page's table: the same data as the graphic, for the Table sheet,
 * the desktop Notes and article mode (design 4.6, 11.1, FR-16).
 *
 * - `caption` names what is counted, the counting window and, on pages that
 *   show clock times, the `tz.note` zone.
 * - `columns` are the header cells (`th scope="col"`).
 * - Each row has one display string per column; its first cell names the row
 *   (`th scope="row"`).
 *
 * Built on the server from the same data as the graphic; null when the page
 * has nothing to tabulate (no Table control then).
 */
export interface PageTable {
  caption: string
  columns: string[]
  rows: string[][]
}

/**
 * What a page's `select` reads besides the facts. `stats` carries the
 * geometry inputs (the soundtrack's daily minutes) and the rules no fact
 * answers (counted plays, Setup's eligibility); P5.9 passes the stats it
 * built the facts from.
 */
export interface SelectContext {
  edition: Edition
  archetype: ArchetypeId | null
  /** `Config.rewindDisabledPages`. */
  disabledPages: readonly string[]
  stats: MemberStats
  /** Seeds the quiz's option order with the year (`hash(userId, year)`); P5.9 passes the member's id. */
  userId?: string
}

/** The part of an entry each page module defines. Methods, so a typed page fits `RegistryEntry<unknown>`. */
export interface PageDefinition<D> {
  select(facts: RewindFactsV3, ctx: SelectContext): D | null
  schema: z.ZodType<D>
  srSummary(data: D, facts: RewindFactsV3): string
  table?(data: D, facts: RewindFactsV3, settings: { locale: string }): PageTable | null
  /**
   * The page in article mode (P5.12), from the same data, tables and copy as
   * its story page. A page without one reads as its summary and Table
   * (`articleBlocks`).
   */
  article?(data: D, facts: RewindFactsV3, ctx: ArticleContext): ArticleBlock[]
  /**
   * The facts the page's share card may print (P5.10); `titles` are those
   * that name a title, `art` a poster. `titleKeys` maps the title facts the
   * page data knows to their rating keys, so a hidden title leaves the
   * projection at once and art is published by key.
   */
  share: { facts: FactId[]; titles?: FactId[]; art?: true; titleKeys?(data: D): Partial<Record<FactId, string>> }
}

export interface RegistryEntry<D = unknown> extends PageDefinition<D> {
  type: IssuePageType
  /** The page's one name, used on every surface. */
  name: string
  act: Act
  field: InkName | "archetype"
  altField: InkName | null
  spot: "arch" | "arch-deep" | "ink"
  core: boolean
  /** In the pocket edition: as itself, merged into Short list, or as whichever of clock and calendar says more. */
  pocket: false | "page" | "short-list" | "clock-or-calendar"
  dwell: Dwell
}

/** How long the guess is counted for in the issue's running time. */
export const HOLD_ESTIMATE_MS = 12_000
/** After an answer, how long the reveal stays before autoplay turns the page. */
export const REVEAL_DWELL_MS = 4000
/** One page turn. */
export const TURN_MS = 420

type Spec = Pick<RegistryEntry, "name" | "act" | "field" | "altField" | "core" | "pocket" | "dwell">

function entry<D>(type: IssuePageType, spec: Spec, page: PageDefinition<D>): RegistryEntry<D> {
  const spot = spec.field === "archetype" ? "arch" : spec.field === "paper" ? "arch-deep" : "ink"
  return { type, ...spec, spot, ...page }
}

const p = pendingPages

export const registry = {
  cover: entry("cover", { name: "Cover", act: "front", field: "archetype", altField: null, core: true, pocket: "page", dwell: "tap" }, coverPage),
  number: entry("number", { name: "The number", act: "front", field: "coral", altField: "peach", core: true, pocket: "page", dwell: 8000 }, numberPage),
  bookends: entry("bookends", { name: "Bookends", act: "front", field: "paper", altField: null, core: true, pocket: false, dwell: 7000 }, bookendsPage),
  guess: entry("guess", { name: "Guess", act: "features", field: "rose", altField: "lilac", core: true, pocket: false, dwell: "hold" }, guessPage),
  "top-shows": entry("top-shows", { name: "Top shows", act: "features", field: "paper", altField: null, core: true, pocket: "short-list", dwell: 9000 }, topShowsPage),
  "top-films": entry("top-films", { name: "Top films", act: "features", field: "marigold", altField: "sky", core: true, pocket: "short-list", dwell: 8000 }, topFilmsPage),
  taste: entry("taste", { name: "Taste", act: "features", field: "petrol", altField: "oxblood", core: false, pocket: false, dwell: 8000 }, p.taste),
  people: entry("people", { name: "People", act: "features", field: "paper", altField: null, core: false, pocket: false, dwell: 7000 }, p.people),
  clock: entry("clock", { name: "The clock", act: "habits", field: "forest", altField: "ultramarine", core: true, pocket: "clock-or-calendar", dwell: 8000 }, clockPage),
  calendar: entry("calendar", { name: "The calendar", act: "habits", field: "paper", altField: null, core: true, pocket: "clock-or-calendar", dwell: 9000 }, calendarPage),
  race: entry("race", { name: "The race", act: "habits", field: "mint", altField: "sky", core: false, pocket: false, dwell: 10_000 }, p.race),
  records: entry("records", { name: "Records", act: "habits", field: "peach", altField: "rose", core: false, pocket: false, dwell: 8000 }, p.records),
  setup: entry("setup", { name: "Setup", act: "server", field: "paper", altField: null, core: false, pocket: false, dwell: 6000 }, setupPage),
  requests: entry("requests", { name: "Requests", act: "server", field: "lilac", altField: "mint", core: false, pocket: false, dwell: 7000 }, requestsPage),
  standing: entry("standing", { name: "Standing", act: "server", field: "sky", altField: "coral", core: false, pocket: false, dwell: 7000 }, standingPage),
  centrefold: entry("centrefold", { name: "Centrefold", act: "centrefold", field: "archetype", altField: null, core: true, pocket: "page", dwell: 12_000 }, centrefoldPage),
  "next-year": entry("next-year", { name: "Next year", act: "back", field: "paper", altField: null, core: false, pocket: false, dwell: 7000 }, nextYearPage),
  "back-cover": entry("back-cover", { name: "Back cover", act: "back", field: "paper", altField: null, core: true, pocket: "page", dwell: "end" }, backCoverPage),
} as const satisfies Record<IssuePageType, RegistryEntry>

/** Every page in issue order. */
export const issuePages: RegistryEntry[] = Object.values(registry)

/**
 * Pages whose components land in P7.1 and P7.2. Until then `selectPages`
 * leaves them out, so the full issue is the ten core pages; each step removes
 * its pages from this list.
 */
export const LATER_PAGES: readonly IssuePageType[] = ["taste", "people", "race", "records"]

/** The pages a card can print: every page but Setup and Next year (design 6.4). */
export const SHARE_PAGE_TYPES = issuePages.map((p) => p.type).filter((t) => t !== "setup" && t !== "next-year") as [
  IssuePageType,
  ...IssuePageType[],
]

/**
 * The pocket edition's six pages as the running time counts them: Short list
 * (P7.3) stands in as Top shows, and the clock for "clock or calendar".
 */
export const POCKET_ESTIMATE: readonly IssuePageType[] = ["cover", "number", "top-shows", "clock", "centrefold", "back-cover"]

/**
 * The autoplay running time of an issue: each page's dwell (the guess counted
 * at `HOLD_ESTIMATE_MS`, the cover and back cover at 0) plus 420 ms per turn.
 *
 * @example
 * ```ts
 * issueDurationMs(issuePages.map((p) => p.type)) // 140140, "about 2 min 20 s"
 * ```
 */
export function issueDurationMs(pages: readonly IssuePageType[]): number {
  const dwell = pages.reduce((sum, type) => {
    const d = registry[type].dwell
    return sum + (typeof d === "number" ? d : d === "hold" ? HOLD_ESTIMATE_MS : 0)
  }, 0)
  return dwell + Math.max(0, pages.length - 1) * TURN_MS
}
