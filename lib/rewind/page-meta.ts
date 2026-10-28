/**
 * What the story stage needs to know about each page (design 4.2): its name,
 * act, fields, edition role and dwell. Client-safe and free of Zod and the
 * page modules, so the stage's first-page bundle stays small (P7.15); the
 * full `registry` (`lib/rewind/registry.ts`) spreads these into its entries.
 *
 * @module lib/rewind/page-meta
 */

import type { InkName } from "@/lib/design/tokens"
import { CARD_PAGE_TYPES } from "@/lib/rewind/cards/eligible"
import type { PageType } from "@/lib/wrapped/data/page-types"

export type Act = "front" | "features" | "habits" | "server" | "centrefold" | "back"

/** The pages only the short editions print (P7.3): the pocket edition's Short list and the postcard. */
export type EditionPageType = "short-list" | "postcard"

/** The 18 pages of the full issue. */
export type IssuePageType = Exclude<PageType, EditionPageType>

/** Every page a stored issue can hold. */
export type RewindPageType = IssuePageType | EditionPageType

/**
 * Autoplay hold in ms, or how the page waits instead: `tap` (the cover waits
 * for a cut), `hold` (the guess waits for an answer), `end` (the back cover).
 */
export type Dwell = number | "tap" | "hold" | "end"

export interface PageMeta {
  type: RewindPageType
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

type Spec = Omit<PageMeta, "type" | "spot">

function meta(type: RewindPageType, spec: Spec): PageMeta {
  const spot = spec.field === "archetype" ? "arch" : spec.field === "paper" ? "arch-deep" : "ink"
  return { type, ...spec, spot }
}

/** Every page's metadata, in issue order. */
export const pageMeta = {
  cover: meta("cover", { name: "Cover", act: "front", field: "archetype", altField: null, core: true, pocket: "page", dwell: "tap" }),
  number: meta("number", { name: "The number", act: "front", field: "coral", altField: "peach", core: true, pocket: "page", dwell: 8000 }),
  bookends: meta("bookends", { name: "Bookends", act: "front", field: "paper", altField: null, core: true, pocket: false, dwell: 7000 }),
  guess: meta("guess", { name: "Guess", act: "features", field: "rose", altField: "lilac", core: true, pocket: false, dwell: "hold" }),
  "top-shows": meta("top-shows", { name: "Top shows", act: "features", field: "paper", altField: null, core: true, pocket: "short-list", dwell: 9000 }),
  "top-films": meta("top-films", { name: "Top movies", act: "features", field: "marigold", altField: "sky", core: true, pocket: "short-list", dwell: 8000 }),
  taste: meta("taste", { name: "Taste", act: "features", field: "petrol", altField: "oxblood", core: false, pocket: false, dwell: 8000 }),
  people: meta("people", { name: "People", act: "features", field: "paper", altField: null, core: false, pocket: false, dwell: 7000 }),
  clock: meta("clock", { name: "The clock", act: "habits", field: "forest", altField: "ultramarine", core: true, pocket: "clock-or-calendar", dwell: 8000 }),
  calendar: meta("calendar", { name: "The calendar", act: "habits", field: "paper", altField: null, core: true, pocket: "clock-or-calendar", dwell: 9000 }),
  race: meta("race", { name: "The race", act: "habits", field: "mint", altField: "sky", core: false, pocket: false, dwell: 10_000 }),
  records: meta("records", { name: "Records", act: "habits", field: "peach", altField: "rose", core: false, pocket: false, dwell: 8000 }),
  setup: meta("setup", { name: "Setup", act: "server", field: "paper", altField: null, core: false, pocket: false, dwell: 6000 }),
  requests: meta("requests", { name: "Requests", act: "server", field: "lilac", altField: "mint", core: false, pocket: false, dwell: 7000 }),
  standing: meta("standing", { name: "Standing", act: "server", field: "sky", altField: "coral", core: false, pocket: false, dwell: 7000 }),
  centrefold: meta("centrefold", { name: "Centrefold", act: "centrefold", field: "archetype", altField: null, core: true, pocket: "page", dwell: 12_000 }),
  "next-year": meta("next-year", { name: "Next year", act: "back", field: "paper", altField: null, core: false, pocket: false, dwell: 7000 }),
  "back-cover": meta("back-cover", { name: "Back cover", act: "back", field: "paper", altField: null, core: true, pocket: "page", dwell: "end" }),
  // The short editions' own pages (P7.3): never in the full issue.
  "short-list": meta("short-list", { name: "Short list", act: "features", field: "paper", altField: null, core: false, pocket: "page", dwell: 9000 }),
  postcard: meta("postcard", { name: "Postcard", act: "front", field: "paper", altField: null, core: false, pocket: false, dwell: "end" }),
} as const satisfies Record<RewindPageType, PageMeta>

/** The pages a card can print: every page but Setup and Next year (design 6.4). */
export const SHARE_PAGE_TYPES = (Object.keys(pageMeta) as RewindPageType[]).filter((t) => t !== "setup" && t !== "next-year") as [
  RewindPageType,
  ...RewindPageType[],
]

const CARDS: ReadonlySet<string> = new Set(CARD_PAGE_TYPES)
const SHAREABLE: ReadonlySet<string> = new Set(SHARE_PAGE_TYPES)

/**
 * The share formats line at the foot of the desktop Notes (P7.4), or null on
 * a page that offers no card (Setup, Next year). Pages without a card yet
 * share a link.
 *
 * @example
 * ```ts
 * shareFormats("top-shows") // "Story card, 1080 by 1920"
 * shareFormats("setup")     // null
 * ```
 */
export function shareFormats(type: RewindPageType): string | null {
  if (CARDS.has(type)) return "Story card, 1080 by 1920"
  return SHAREABLE.has(type) ? "A link to your shared Rewind" : null
}
