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
 * - `notes(data, facts, ctx)` is the page's desktop Notes column (P7.4); a
 *   page without one shows its `srSummary` there (`pageNotes`).
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

import type { ArticleBlock, ArticleContext } from "@/lib/rewind/article/blocks"
import type { RewindFeatureFlags } from "@/lib/rewind/features"
import { HOLD_ESTIMATE_MS, pageMeta, TURN_MS, type IssuePageType, type PageMeta, type RewindPageType } from "@/lib/rewind/page-meta"
import { backCoverPage } from "@/lib/rewind/pages/back-cover"
import { bookendsPage } from "@/lib/rewind/pages/bookends"
import { calendarPage } from "@/lib/rewind/pages/calendar"
import { centrefoldPage } from "@/lib/rewind/pages/centrefold"
import { clockPage } from "@/lib/rewind/pages/clock"
import { coverPage } from "@/lib/rewind/pages/cover"
import { guessPage } from "@/lib/rewind/pages/guess"
import { nextYearPage } from "@/lib/rewind/pages/next-year"
import { numberPage } from "@/lib/rewind/pages/number"
import { postcardPage } from "@/lib/rewind/pages/postcard"
import { shortListPage } from "@/lib/rewind/pages/short-list"
import { peoplePage } from "@/lib/rewind/pages/people"
import { racePage } from "@/lib/rewind/pages/race"
import { recordsPage } from "@/lib/rewind/pages/records"
import { requestsPage } from "@/lib/rewind/pages/requests"
import { setupPage } from "@/lib/rewind/pages/setup"
import { standingPage } from "@/lib/rewind/pages/standing"
import { tastePage } from "@/lib/rewind/pages/taste"
import { topFilmsPage } from "@/lib/rewind/pages/top-films"
import { topShowsPage } from "@/lib/rewind/pages/top-shows"
import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"
import type { ShareSafePage } from "@/lib/wrapped/data/share-safe-schema"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import type { MemberStats } from "@/lib/wrapped/stats/compute"

export type { Act, Dwell, EditionPageType, IssuePageType, PageMeta, RewindPageType } from "@/lib/rewind/page-meta"
export { HOLD_ESTIMATE_MS, REVEAL_DWELL_MS, SHARE_PAGE_TYPES, TURN_MS } from "@/lib/rewind/page-meta"

export type Edition = "full" | "pocket" | "postcard"

/**
 * A chart page's table: the same data as the graphic, for the Table sheet,
 * the desktop Notes and article mode (design 4.6, 11.1, FR-16).
 *
 * - `caption` names what is counted and the counting window. It never names
 *   a time zone: times are the member's own (design 7.7).
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

/** What a page's desktop Notes read besides its data and facts (P7.4). */
export interface NotesContext {
  locale: string
  /** Rating keys the member hid (P7.7), left out before the no-LLM regeneration lands. */
  hiddenKeys?: ReadonlySet<string>
  /** The December features (P8.3); the calendar reads `calendar.grid`. */
  features?: Partial<RewindFeatureFlags>
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
   * The page's desktop Notes (P7.4): blocks that extend the page rather than
   * repeat it. P7.4 writes Top shows, the calendar and the centrefold; P8.4
   * adds the other core pages.
   */
  notes?(data: D, facts: RewindFactsV3, ctx: NotesContext): ArticleBlock[]
  /**
   * The facts the page's share card may print (P5.10); `titles` are those
   * that name a title, `art` a poster. `titleKeys` maps the title facts the
   * page data knows to their rating keys, so a hidden title leaves the
   * projection at once and art is published by key. `pick` narrows `facts`
   * to the ones this issue's page prints, where its data decides (P7.6's
   * Short list card prints its own three rows of the two lists).
   */
  share: { facts: FactId[]; titles?: FactId[]; art?: true; titleKeys?(data: D): Partial<Record<FactId, string>>; pick?(data: D): FactId[] }
}

export interface RegistryEntry<D = unknown> extends PageDefinition<D>, PageMeta {}

function entry<D>(meta: PageMeta, page: PageDefinition<D>): RegistryEntry<D> {
  return { ...meta, ...page }
}

/** Each page's metadata (`pageMeta`, which the client stage reads alone) with its definition. */
export const registry = {
  cover: entry(pageMeta.cover, coverPage),
  number: entry(pageMeta.number, numberPage),
  bookends: entry(pageMeta.bookends, bookendsPage),
  guess: entry(pageMeta.guess, guessPage),
  "top-shows": entry(pageMeta["top-shows"], topShowsPage),
  "top-films": entry(pageMeta["top-films"], topFilmsPage),
  taste: entry(pageMeta.taste, tastePage),
  people: entry(pageMeta.people, peoplePage),
  clock: entry(pageMeta.clock, clockPage),
  calendar: entry(pageMeta.calendar, calendarPage),
  race: entry(pageMeta.race, racePage),
  records: entry(pageMeta.records, recordsPage),
  setup: entry(pageMeta.setup, setupPage),
  requests: entry(pageMeta.requests, requestsPage),
  standing: entry(pageMeta.standing, standingPage),
  centrefold: entry(pageMeta.centrefold, centrefoldPage),
  "next-year": entry(pageMeta["next-year"], nextYearPage),
  "back-cover": entry(pageMeta["back-cover"], backCoverPage),
  // The short editions' own pages (P7.3): never in the full issue, so outside `issuePages`.
  "short-list": entry(pageMeta["short-list"], shortListPage),
  postcard: entry(pageMeta.postcard, postcardPage),
} as const satisfies Record<RewindPageType, RegistryEntry>

/** A full-issue page's entry. */
export type IssueEntry = RegistryEntry & { type: IssuePageType }

const EDITION_PAGES: readonly RewindPageType[] = ["short-list", "postcard"]

/** Every page of the full issue, in issue order. */
export const issuePages: IssueEntry[] = (Object.values(registry) as RegistryEntry[]).filter((entry): entry is IssueEntry => !EDITION_PAGES.includes(entry.type))

/**
 * Pages whose components have not landed yet: `selectPages` leaves them
 * out. Every page of the issue has landed (P7.1 and P7.2 took the last eight).
 */
export const LATER_PAGES: readonly IssuePageType[] = []

/**
 * The pocket edition's six pages as the running time counts them before an
 * issue's own cut is known, with the clock for "clock or calendar".
 */
export const POCKET_ESTIMATE: readonly RewindPageType[] = ["cover", "number", "short-list", "clock", "centrefold", "back-cover"]

/**
 * The autoplay running time of an issue: each page's dwell (the guess counted
 * at `HOLD_ESTIMATE_MS`, the cover and back cover at 0) plus 420 ms per turn.
 *
 * @example
 * ```ts
 * issueDurationMs(issuePages.map((p) => p.type)) // 140140, "about 2 min 20 s"
 * ```
 */
export function issueDurationMs(pages: readonly RewindPageType[]): number {
  const dwell = pages.reduce((sum, type) => {
    const d = registry[type].dwell
    return sum + (typeof d === "number" ? d : d === "hold" ? HOLD_ESTIMATE_MS : 0)
  }, 0)
  return dwell + Math.max(0, pages.length - 1) * TURN_MS
}

const sentence = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`)

/**
 * The alt text of a page's published card on the share page (P7.5), built
 * only from the projected page, so it names nothing the card does not: the
 * page name, its card headline, the archetype where the page publishes it,
 * and its published titles.
 *
 * @example
 * ```ts
 * shareAlt({ type: "top-shows", headline: "Severance led your year", titles: ["Severance", "Andor"], archetype: null })
 * // "Top shows card. Severance led your year. Severance, Andor."
 * ```
 */
export function shareAlt(page: Pick<ShareSafePage, "type" | "headline" | "titles" | "archetype">): string {
  const parts = [`${registry[page.type].name} card`, page.headline]
  if (page.archetype && !page.headline.includes(page.archetype.name)) parts.push(`I’m the ${page.archetype.name}`)
  if (page.titles.length > 0) parts.push(page.titles.join(", "))
  return parts.filter(Boolean).map(sentence).join(" ")
}
