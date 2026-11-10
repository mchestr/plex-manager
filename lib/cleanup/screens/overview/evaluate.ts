/**
 * One live evaluation of a definition on the cached library data (TS 12.7
 * items 1 and 2): its matches largest first, their bytes and the counts the
 * rule card and the recipe card read. The same engine as a run (E11).
 * Pure and client-safe.
 *
 * @module lib/cleanup/screens/overview/evaluate
 */

import { classify } from "@/lib/cleanup/engine/classify"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import { evaluateRule } from "@/lib/cleanup/engine/evaluate"
import type { EvalContext } from "@/lib/cleanup/engine/types"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { LoadedSnapshot } from "@/lib/cleanup/snapshot/cache"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"

export interface DefinitionEvaluation {
  /** Largest first, then by item key. An unknown size counts 0. */
  matches: SnapshotItem[]
  bytes: number
  /** Items of the rule's level in its libraries. */
  checked: number
  cannotDelete: number
}

const size = (item: SnapshotItem) => item.sizeBytes ?? 0
/** Item keys are unique in a level, so two items never compare equal. */
const bySize = (a: SnapshotItem, b: SnapshotItem) => size(b) - size(a) || (a.key < b.key ? -1 : 1)

/** The evaluation of `definition`, or null when its level has no library data. */
export function evaluateDefinition(definition: RuleDefinition, levels: LoadedSnapshot["levels"], ctx: EvalContext): DefinitionEvaluation | null {
  const level = levels[definition.level]
  if (!level) return null
  const results = evaluateRule(compileDefinition(definition), level.items, ctx)
  const matches: SnapshotItem[] = []
  let cannotDelete = 0
  for (const result of results) {
    const kind = classify(result).class
    if (kind === "match") matches.push(result.item)
    else if (kind === "cannotDelete") cannotDelete += 1
  }
  matches.sort(bySize)
  return { matches, bytes: matches.reduce((sum, item) => sum + size(item), 0), checked: results.length, cannotDelete }
}

/** The rating keys of the `count` largest matches (the card posters). */
export const posterKeys = (evaluation: DefinitionEvaluation | null, count: number): string[] =>
  (evaluation?.matches ?? []).slice(0, count).map((item) => item.ratingKey)
