/**
 * Near misses (TS 6.5): how close each one is, the day it passes if nothing
 * happens, and one value that includes it, with the effect of that value on
 * the rule. Each field answers through `ctx.evals` (deviation D1). Client-safe.
 *
 * A near miss fails exactly one clause. A top-level condition answers for
 * itself. A draft group with one complete condition acts as that condition
 * (TS 3.2). Any other group has no gap, forecast or try value.
 *
 * @module lib/cleanup/engine/near-miss
 */

import { classify } from "@/lib/cleanup/engine/classify"
import { findCondition, replaceCondition } from "@/lib/cleanup/engine/compile"
import { evaluateRule, fieldEvalOf } from "@/lib/cleanup/engine/evaluate"
import type { Classification, CompiledRule, EvalContext, ItemResult } from "@/lib/cleanup/engine/types"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { type Condition, conditionSchema } from "@/lib/validations/cleanup-rule"

/** One near miss: its result, its failing clause id and its gap (lower is closer, null has no order). */
export interface NearMiss {
  result: ItemResult
  failing: string
  gap: number | null
}

/** The condition that a clause acts as, or null for a group of two or more. */
function actingCondition(compiled: CompiledRule, clauseId: string): Condition | null {
  const clause = compiled.clauses.find((c) => c.id === clauseId)
  if (!clause) return null
  if (clause.kind === "condition") return clause.condition
  return clause.conditions.length === 1 ? clause.conditions[0] : null
}

/** How far the item is from passing its failing clause. Null for a group and a field with no order. */
export function nearMissGap(compiled: CompiledRule, result: ItemResult, failing: string, ctx: EvalContext): number | null {
  const condition = actingCondition(compiled, failing)
  return condition ? (fieldEvalOf(ctx, condition).gap?.(result.item, condition, ctx) ?? null) : null
}

/** The day key on which the failing clause passes with no new play or add (time fields with `moreThan`), else null. */
export function nearMissForecast(compiled: CompiledRule, result: ItemResult, failing: string, ctx: EvalContext): string | null {
  const condition = actingCondition(compiled, failing)
  return condition ? (fieldEvalOf(ctx, condition).forecast?.(result.item, condition, ctx) ?? null) : null
}

/** The failing condition with the one value that includes the item, or null when the field has none. */
export function nearMissTryValue(compiled: CompiledRule, result: ItemResult, failing: string, ctx: EvalContext): Condition | null {
  const condition = actingCondition(compiled, failing)
  if (!condition) return null
  const value = fieldEvalOf(ctx, condition).tryValue?.(result.item, condition, ctx) ?? null
  if (value === null) return null
  const parsed = conditionSchema.safeParse({ ...condition, value })
  return parsed.success ? parsed.data : null
}

/** Closest first. A null gap sorts after every number. Ties sort by title, then by item key. */
export function byCloseness(a: NearMiss, b: NearMiss): number {
  if (a.gap !== b.gap) {
    if (a.gap === null) return 1
    if (b.gap === null) return -1
    return a.gap - b.gap
  }
  return a.result.item.title.localeCompare(b.result.item.title, "en") || a.result.item.key.localeCompare(b.result.item.key, "en")
}

/**
 * The near misses of the results, closest first (the "Closest first" sort of
 * the Near misses tab). `classes` holds the class of each result in order.
 */
export function nearMisses(
  compiled: CompiledRule,
  results: readonly ItemResult[],
  ctx: EvalContext,
  classes: readonly Classification[] = results.map(classify),
): NearMiss[] {
  const list: NearMiss[] = []
  results.forEach((result, i) => {
    const { class: itemClass, failing } = classes[i]
    if (itemClass !== "nearMiss" || failing === undefined) return
    list.push({ result, failing, gap: nearMissGap(compiled, result, failing, ctx) })
  })
  return list.sort(byCloseness)
}

/** The matches of a rule over its items: the count, and the bytes with an unknown size as 0. */
export function matchTotals(compiled: CompiledRule, items: readonly SnapshotItem[], ctx: EvalContext): { matches: number; bytes: number } {
  let matches = 0
  let bytes = 0
  for (const result of evaluateRule(compiled, items, ctx)) {
    if (classify(result).class !== "match") continue
    matches += 1
    bytes += result.item.sizeBytes ?? 0
  }
  return { matches, bytes }
}

/**
 * The effect of one changed value (TS 6.5, the Why Sheet "Try"): the rule
 * runs again over the same items with only that condition's value changed.
 * `addsCount` and `addsBytes` are the new matches and bytes minus the
 * current ones. `current` skips the first run when the caller has the
 * totals. Null when the id names no condition or the value does not parse.
 */
export function tryValueEffect(
  compiled: CompiledRule,
  items: readonly SnapshotItem[],
  ctx: EvalContext,
  change: { conditionId: string; value: unknown },
  current: { matches: number; bytes: number } = matchTotals(compiled, items, ctx),
): { addsCount: number; addsBytes: number } | null {
  const condition = findCondition(compiled, change.conditionId)
  if (!condition) return null
  const parsed = conditionSchema.safeParse({ ...condition, value: change.value })
  if (!parsed.success) return null
  const next = matchTotals(replaceCondition(compiled, parsed.data), items, ctx)
  return { addsCount: next.matches - current.matches, addsBytes: next.bytes - current.bytes }
}
