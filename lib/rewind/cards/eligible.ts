/**
 * Which cards a member can share (design 6.4 "Card list"). Client-safe: the
 * share sheet's page picker, the share page and P8.4's "Save all {n} cards"
 * read it, and `lib/rewind/cards/index.ts` keeps a renderer for exactly
 * these pages (its test checks).
 *
 * ## The rule (P7.6)
 *
 * It reads the share-safe projection of the issue, so the admin flags and
 * the member's hidden titles have already been applied. A page's card is
 * listed when the issue printed the page, the projection published it, and
 * the card's own condition holds:
 *
 * | Card | Needs |
 * |---|---|
 * | Bookends, Guess, Top shows, Top films, Short list, The race | a title that is not hidden |
 * | Calendar | Daily detail, and its days |
 * | Taste, Records | their graphic |
 * | People | a name |
 * | Requests | the request count |
 * | Standing | the percentile, which the projection prints only at top 25% or better |
 *
 * The postcard always has its card. Setup and Next year have none.
 *
 * @module lib/rewind/cards/eligible
 */

import type { FactId } from "@/lib/wrapped/facts/catalogue"
import type { ShareOptions, ShareSafePage, SharePageType } from "@/lib/wrapped/data/share-safe-schema"

/** Every card, in registry order: the full issue's, then the short editions' Short list and postcard. */
export const CARD_PAGE_TYPES = [
  "cover", "number", "bookends", "guess", "top-shows", "top-films", "taste", "people",
  "clock", "calendar", "race", "records", "requests", "standing", "centrefold", "back-cover",
  "short-list", "postcard",
] as const satisfies readonly SharePageType[]

/** What the rule reads of a projected page. */
export type EligiblePage = Pick<ShareSafePage, "type" | "titles" | "facts" | "soundtrack" | "graphic">

const hasFact = (page: EligiblePage, pattern: RegExp) => (Object.keys(page.facts) as FactId[]).some((id) => pattern.test(id))

const CONDITIONS: Partial<Record<SharePageType, (page: EligiblePage, options: Pick<ShareOptions, "dailyDetail">) => boolean>> = {
  bookends: (page) => page.titles.length > 0,
  guess: (page) => page.titles.length > 0,
  "top-shows": (page) => page.titles.length > 0,
  "top-films": (page) => page.titles.length > 0,
  "short-list": (page) => page.titles.length > 0,
  race: (page) => page.titles.length > 0 && page.graphic?.kind === "bars",
  calendar: (page, options) => options.dailyDetail && page.soundtrack?.grain === "daily",
  taste: (page) => page.graphic?.kind === "bars" && hasFact(page, /^taste\.genre\[\d\]\.name$/),
  records: (page) => page.graphic?.kind === "records" && page.graphic.cells.length > 0,
  people: (page) => hasFact(page, /^people\.(actor|director)\[\d\]\.name$/),
  requests: (page) => hasFact(page, /^requests\.made$/),
  standing: (page) => hasFact(page, /^standing\.percentile$/),
}

const HAS_CARD: ReadonlySet<string> = new Set(CARD_PAGE_TYPES)

/**
 * The cards available for a projected issue under the current options, in
 * issue order: every published page that has a card and meets its condition.
 *
 * @example
 * ```ts
 * const page = (type: SharePageType, titles: string[] = []) => ({ type, titles, facts: {}, soundtrack: null })
 * eligibleCards({ pages: [page("cover"), page("top-shows"), page("calendar")] }, { dailyDetail: false })
 * // ["cover"]: no title is left on Top shows, and the calendar needs Daily detail
 * ```
 */
export function eligibleCards(shared: { pages: ReadonlyArray<EligiblePage> }, options: Pick<ShareOptions, "dailyDetail">): SharePageType[] {
  return shared.pages.filter((page) => HAS_CARD.has(page.type) && (CONDITIONS[page.type]?.(page, options) ?? true)).map((page) => page.type)
}
