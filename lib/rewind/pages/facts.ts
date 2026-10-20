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

/** The window is the full year: after the final cut. */
export const isFinalCut = (facts: RewindFactsV3): boolean => num(facts, "window.finalCut") === 1
