/**
 * The page registry: what each page of a Rewind 2026 issue is (design 4.2).
 *
 * Every surface that names, orders, colours or times a page reads it here:
 * the folio, progress label, Contents, cover lines, the back-cover index and
 * the RewindCard's "18 pages, about 2 min 20 s". Entries are in issue order.
 *
 * Until P5.5, `select` returns null and `schema` accepts anything; P5.5 to
 * P7.2 fill them in page by page. `table` marks the ten chart pages, whose
 * Table sheet P5.3 renders (contract: `PageTable`); its stub returns null
 * until each page step supplies the builder.
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

import { z } from "zod"

import type { InkName } from "@/lib/design/tokens"
import type { PageType } from "@/lib/wrapped/data/page-types"

export type Act = "front" | "features" | "habits" | "server" | "centrefold" | "back"

/** The pages of the full issue; the pocket edition's `short-list` arrives in P7.3. */
export type IssuePageType = Exclude<PageType, "short-list">

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
 *   show clock times, the `tz.note` zone ("Hours by month, 1 January to
 *   30 November 2026. Times in America/Chicago, the server's time zone").
 * - `columns` are the header cells (`th scope="col"`).
 * - Each row has one display string per column; its first cell names the row
 *   (`th scope="row"`).
 *
 * The page's `table(data)` builds it from the same `lib/rewind/viz/*` data as
 * the graphic, on the server, and returns null when the page has nothing to
 * tabulate (no Table control then). P5.1 passes it to `StoryStage` per page.
 */
export interface PageTable {
  caption: string
  columns: string[]
  rows: string[][]
}

export interface RegistryEntry {
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
  select: (facts: unknown, ctx: unknown) => unknown
  schema: z.ZodType
  table?: (data: unknown) => PageTable | null
  srSummary?: (data: unknown, facts: unknown) => string
  share?: { facts: string[] }
}

/** How long the guess is counted for in the issue's running time. */
export const HOLD_ESTIMATE_MS = 12_000
/** One page turn. */
export const TURN_MS = 420

const unselected = () => null
const tableStub = () => null

type Spec = Pick<RegistryEntry, "name" | "act" | "field" | "altField" | "core" | "pocket" | "dwell"> & { chart?: true }

function entry(type: IssuePageType, spec: Spec): RegistryEntry {
  const { chart, ...rest } = spec
  const spot = spec.field === "archetype" ? "arch" : spec.field === "paper" ? "arch-deep" : "ink"
  return { type, ...rest, spot, select: unselected, schema: z.unknown(), ...(chart ? { table: tableStub } : {}) }
}

export const registry = {
  cover: entry("cover", { name: "Cover", act: "front", field: "archetype", altField: null, core: true, pocket: "page", dwell: "tap" }),
  number: entry("number", { name: "The number", act: "front", field: "coral", altField: "peach", core: true, pocket: "page", dwell: 8000, chart: true }),
  bookends: entry("bookends", { name: "Bookends", act: "front", field: "paper", altField: null, core: true, pocket: false, dwell: 7000 }),
  guess: entry("guess", { name: "Guess", act: "features", field: "rose", altField: "lilac", core: true, pocket: false, dwell: "hold" }),
  "top-shows": entry("top-shows", { name: "Top shows", act: "features", field: "paper", altField: null, core: true, pocket: "short-list", dwell: 9000, chart: true }),
  "top-films": entry("top-films", { name: "Top films", act: "features", field: "marigold", altField: "sky", core: true, pocket: "short-list", dwell: 8000, chart: true }),
  taste: entry("taste", { name: "Taste", act: "features", field: "petrol", altField: "oxblood", core: false, pocket: false, dwell: 8000, chart: true }),
  people: entry("people", { name: "People", act: "features", field: "paper", altField: null, core: false, pocket: false, dwell: 7000 }),
  clock: entry("clock", { name: "The clock", act: "habits", field: "forest", altField: "ultramarine", core: true, pocket: "clock-or-calendar", dwell: 8000, chart: true }),
  calendar: entry("calendar", { name: "The calendar", act: "habits", field: "paper", altField: null, core: true, pocket: "clock-or-calendar", dwell: 9000, chart: true }),
  race: entry("race", { name: "The race", act: "habits", field: "mint", altField: "sky", core: false, pocket: false, dwell: 10_000, chart: true }),
  records: entry("records", { name: "Records", act: "habits", field: "peach", altField: "rose", core: false, pocket: false, dwell: 8000 }),
  setup: entry("setup", { name: "Setup", act: "server", field: "paper", altField: null, core: false, pocket: false, dwell: 6000, chart: true }),
  requests: entry("requests", { name: "Requests", act: "server", field: "lilac", altField: "mint", core: false, pocket: false, dwell: 7000 }),
  standing: entry("standing", { name: "Standing", act: "server", field: "sky", altField: "coral", core: false, pocket: false, dwell: 7000, chart: true }),
  centrefold: entry("centrefold", { name: "Centrefold", act: "centrefold", field: "archetype", altField: null, core: true, pocket: "page", dwell: 12_000, chart: true }),
  "next-year": entry("next-year", { name: "Next year", act: "back", field: "paper", altField: null, core: false, pocket: false, dwell: 7000 }),
  "back-cover": entry("back-cover", { name: "Back cover", act: "back", field: "paper", altField: null, core: true, pocket: "page", dwell: "end" }),
} as const satisfies Record<IssuePageType, RegistryEntry>

/** Every page in issue order. */
export const issuePages: RegistryEntry[] = Object.values(registry)

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
