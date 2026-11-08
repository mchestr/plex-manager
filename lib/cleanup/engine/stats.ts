/**
 * The order-free statistics of one rule (TS 6.4, UX 4.3.6). Every count
 * reads the verdicts and classes of the items, never the row order of the
 * clauses, so the same rule in another clause order gives the same numbers.
 * Client-safe.
 *
 * - `passAlone[c]`: items where clause `c` passes.
 * - `heldBack[c]`: near misses whose only failing clause is `c` ("{N} more
 *   without it"). These are the near-miss chip counts (UX 4.3.7).
 * - `tabs` plus `notListed` add up to `checked`.
 *
 * @module lib/cleanup/engine/stats
 */

import { classify } from "@/lib/cleanup/engine/classify"
import type { Classification, CompiledRule, ItemResult } from "@/lib/cleanup/engine/types"
import type { PreviewTab } from "@/lib/validations/cleanup-actions"

/** `ruleStats()` output. The records keep the clause and rule protection order of the compiled rule. */
export interface RuleStatistics {
  /** Items of the rule's level in its libraries. */
  checked: number
  passAlone: Record<string, number>
  heldBack: Record<string, number>
  /** Items where every clause passes. */
  allConditions: number
  /** Items of class `protected`. */
  protectedAll: number
  matches: number
  /** The sum of `sizeBytes` of the matches. An unknown size counts 0. */
  bytes: number
  tabs: Record<PreviewTab, number>
  notListed: number
  /** Items of class `protected` by each protection that protects them. One item counts under each of them. */
  protectedBy: Record<string, number>
  /** `protectedBy` for the rule protections only ("keeps N safe"). */
  keepsSafe: Record<string, number>
}

const TAB_OF = {
  match: "matches",
  nearMiss: "nearMisses",
  protected: "protected",
  missing: "missing",
  cannotDelete: "cannotDelete",
} as const satisfies Record<Exclude<Classification["class"], "notListed">, PreviewTab>

const zeros = (ids: readonly string[]) => Object.fromEntries(ids.map((id) => [id, 0])) as Record<string, number>

/**
 * The statistics of the rule over its results (from `evaluateRule()`).
 * `classes` holds the class of each result in the same order. It defaults to
 * `classify()` of each result.
 */
export function ruleStats(
  compiled: CompiledRule,
  results: readonly ItemResult[],
  classes: readonly Classification[] = results.map(classify),
): RuleStatistics {
  const clauseIds = compiled.clauses.map((c) => c.id)
  const ruleProtections = new Set(compiled.protections.map((p) => p.id))
  const stats: RuleStatistics = {
    checked: results.length,
    passAlone: zeros(clauseIds),
    heldBack: zeros(clauseIds),
    allConditions: 0,
    protectedAll: 0,
    matches: 0,
    bytes: 0,
    tabs: { matches: 0, nearMisses: 0, protected: 0, missing: 0, cannotDelete: 0 },
    notListed: 0,
    protectedBy: {},
    keepsSafe: zeros([...ruleProtections]),
  }

  results.forEach((result, i) => {
    let every = true
    for (const clause of result.clauses) {
      if (clause.verdict === "pass") stats.passAlone[clause.id] = (stats.passAlone[clause.id] ?? 0) + 1
      else every = false
    }
    if (every) stats.allConditions += 1

    const { class: itemClass, failing } = classes[i]
    if (itemClass === "notListed") {
      stats.notListed += 1
      return
    }
    stats.tabs[TAB_OF[itemClass]] += 1
    if (itemClass === "match") {
      stats.matches += 1
      stats.bytes += result.item.sizeBytes ?? 0
    } else if (itemClass === "nearMiss" && failing !== undefined) {
      stats.heldBack[failing] = (stats.heldBack[failing] ?? 0) + 1
    } else if (itemClass === "protected") {
      stats.protectedAll += 1
      for (const p of result.protections) {
        if (p.verdict !== "protects") continue
        stats.protectedBy[p.id] = (stats.protectedBy[p.id] ?? 0) + 1
        if (ruleProtections.has(p.id)) stats.keepsSafe[p.id] += 1
      }
    }
  })
  return stats
}
