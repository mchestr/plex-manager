/**
 * Which cards a member can share (design 6.4 "Card list"). Client-safe: the
 * share sheet's page picker reads it, and `lib/rewind/cards/index.ts` keeps a
 * renderer for exactly these pages (its test checks).
 *
 * @module lib/rewind/cards/eligible
 */

import type { ShareOptions, SharePageType } from "@/lib/wrapped/data/share-safe-schema"

/** The six core cards (P5.11), in registry order. P7.6 adds the rest. */
export const CARD_PAGE_TYPES = ["cover", "number", "top-shows", "clock", "centrefold", "back-cover"] as const satisfies readonly SharePageType[]

/** Cards that exist only with Daily detail on: the calendar shows which days were watched. */
const DAILY_ONLY: ReadonlySet<string> = new Set(["calendar"])

const HAS_CARD: ReadonlySet<string> = new Set(CARD_PAGE_TYPES)

/**
 * The cards available for an issue under the current options: every page the
 * issue printed that has a card, in issue order.
 *
 * @example
 * ```ts
 * eligibleCards({ pages: [{ type: "cover" }, { type: "bookends" }, { type: "clock" }] }, { dailyDetail: false })
 * // ["cover", "clock"]
 * ```
 */
export function eligibleCards(
  rewind: { pages: ReadonlyArray<{ type: string }> },
  options: Pick<ShareOptions, "dailyDetail">
): SharePageType[] {
  return rewind.pages
    .map((page) => page.type)
    .filter((type): type is SharePageType => HAS_CARD.has(type) && (options.dailyDetail || !DAILY_ONLY.has(type)))
}
