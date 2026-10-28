/**
 * The cuts of a stored issue (design 4.5, FR-4): the full issue, or the
 * six-page pocket edition that a pocket member gets and any member can pick
 * on the cover.
 *
 * ## The pocket cut
 *
 * Cover, The number, Short list, the habit page, Centrefold and Back cover,
 * numbered 1 to 6 by `validatePagesOnRead`. Short list and the habit page are
 * derived from the stored pages and facts, so a full-issue member who picks
 * the pocket cut keeps the issue's own copy: the copy lives on the issue,
 * never on a page.
 *
 * ## The habit rule
 *
 * ```
 * streak.longest.days >= 3 ──► the calendar
 * else the clock is stored ──► the clock
 * else ──────────────────────► the calendar (its active-dates row under 5 active days)
 * ```
 *
 * The design leaves this open.
 *
 * A postcard is one page whatever the cut.
 *
 * @module lib/rewind/editions
 */

import type { RewindPageType } from "@/lib/rewind/registry"
import { num } from "@/lib/rewind/pages/facts"
import { shortListRows } from "@/lib/rewind/pages/short-list"
import type { StoredPage } from "@/lib/rewind/select-pages"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

export type Cut = "full" | "pocket"

/** A streak of this many days puts the calendar in the pocket edition. */
const HABIT_STREAK_DAYS = 3

/**
 * The pocket edition's habit page: see the module's habit rule. `available`
 * says which of the two the issue holds (the clock only when its own rule
 * held; the calendar is always kept unless disabled).
 *
 * @internal Exported for the tests.
 *
 * @example
 * ```ts
 * habitPage(facts, (type) => type === "clock") // "clock" with a 2-day streak
 * ```
 */
export function habitPage(facts: RewindFactsV3, available: (type: "clock" | "calendar") => boolean): "clock" | "calendar" | null {
  if (num(facts, "streak.longest.days") >= HABIT_STREAK_DAYS && available("calendar")) return "calendar"
  if (available("clock")) return "clock"
  return available("calendar") ? "calendar" : null
}

/** The pocket edition's page types in order, from what the issue holds. */
export function pocketTypes(facts: RewindFactsV3, available: (type: RewindPageType) => boolean, shortList: boolean): RewindPageType[] {
  const habit = habitPage(facts, available)
  const types: Array<RewindPageType | null> = ["cover", "number", shortList ? "short-list" : null, habit, "centrefold", "back-cover"]
  return types.filter((type): type is RewindPageType => type !== null && (type === "short-list" || available(type)))
}

interface StoredIssue {
  edition: "full" | "pocket" | "postcard"
  pages: readonly StoredPage[]
  facts: RewindFactsV3
}

/**
 * The stored pages of `cut`, in order, before validation and numbering.
 *
 * @example
 * ```ts
 * pagesForCut(rewind, "pocket").map((p) => p.type)
 * // ["cover", "number", "short-list", "calendar", "centrefold", "back-cover"]
 * ```
 */
export function pagesForCut(rewind: StoredIssue, cut: Cut): StoredPage[] {
  if (cut === "full" || rewind.edition === "postcard") return [...rewind.pages]
  const stored = new Map(rewind.pages.map((page) => [page.type, page.data]))
  const rows = (type: "top-shows" | "top-films") => {
    const data = stored.get(type) as { rows?: Array<{ key: string }> } | undefined
    return Array.isArray(data?.rows) ? data.rows : []
  }
  const shortList = stored.get("short-list") ?? shortListRows(rows("top-shows"), rows("top-films"), rewind.facts)
  const data = (type: RewindPageType) => (type === "short-list" ? shortList : stored.get(type))
  return pocketTypes(rewind.facts, (type) => stored.has(type), shortList !== null && shortList !== undefined).map((type) => ({ type, data: data(type) }))
}
