/**
 * Reading a member's facts on a page: presence, display and raw value. A
 * page never formats a number a fact already displays.
 *
 * @module lib/rewind/pages/facts
 */

import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

export const has = (facts: RewindFactsV3, id: FactId): boolean => facts[id] !== undefined

/** The fact's display string, or "" when the member lacks it. */
export const shown = (facts: RewindFactsV3, id: FactId): string => facts[id]?.display ?? ""

/** The fact's raw number, or 0 when it is missing or not a number. */
export function num(facts: RewindFactsV3, id: FactId): number {
  const value = facts[id]?.value
  return typeof value === "number" ? value : 0
}

/** The issue's year, from `window.from` (`YYYY-MM-DD`). */
export function issueYear(facts: RewindFactsV3): number {
  const from = facts["window.from"]?.value
  return typeof from === "string" ? Number(from.slice(0, 4)) : 0
}

/** The window is the whole year: the issue was made after the year ended (the stored fact keeps its old name, `window.finalCut`). */
export const isWholeYear = (facts: RewindFactsV3): boolean => num(facts, "window.finalCut") === 1

/** "Vol. 4, No. K7Q4" from the member's volume and serial, or "" without them. */
export const volumeLine = (facts: RewindFactsV3): string =>
  [has(facts, "member.volume") && `Vol. ${shown(facts, "member.volume")}`, has(facts, "member.serial") && `No. ${shown(facts, "member.serial")}`].filter(Boolean).join(", ")
