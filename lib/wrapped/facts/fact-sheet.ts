/**
 * The compact fact sheet the LLM receives (design 7.8, 8.3): only the facts
 * P5.8's selected slots may cite, as `{ id, display }` pairs, plus the
 * allow-list of titles among them.
 *
 * Raw values never leave: a model sees exactly the strings a page prints, so
 * it can neither recompute nor round a number. The sheet carries no user id,
 * email or other member, because no fact holds one.
 *
 * @module lib/wrapped/facts/fact-sheet
 */

import type { FactId, RewindFactsV3 } from "./catalogue"

export interface FactSheet {
  facts: Array<{ id: FactId; display: string }>
  /** The display titles among those facts, for the grounding check. */
  titles: string[]
}

/**
 * @param factIds - The ids the selected slots allow; ids the member lacks are skipped.
 *
 * @example
 * ```ts
 * buildFactSheet(facts, ["time.totalHours", "series[1].title"])
 * // { facts: [{ id: "time.totalHours", display: "1,307" }, { id: "series[1].title", display: "Severance" }], titles: ["Severance"] }
 * ```
 */
export function buildFactSheet(facts: RewindFactsV3, factIds: readonly FactId[]): FactSheet {
  const picked = [...new Set(factIds)].flatMap((id) => {
    const fact = facts[id]
    return fact ? [{ id, fact }] : []
  })
  return {
    facts: picked.map(({ id, fact }) => ({ id, display: fact.display })),
    titles: [...new Set(picked.filter(({ fact }) => fact.unit === "title").map(({ fact }) => fact.display))],
  }
}
